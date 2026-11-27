"""
Nova Intelligence narrative service (CrewAI + Groq).

The Next.js app gathers facts deterministically (with the user's permissions) and POSTs them here.
Agents have NO tools: they can only read the facts they are given and write an explanation, so they
cannot query data the user isn't allowed to see, invent records, or perform actions.

Env: GROQ_API_KEY (required for LLM output), GROQ_MODEL (default groq/llama-3.3-70b-versatile),
     ASSISTANT_SERVICE_TOKEN (optional shared secret), PORT.
"""
import json
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Nova Intelligence")
MODEL = os.environ.get("GROQ_MODEL", "groq/llama-3.3-70b-versatile")
TOKEN = os.environ.get("ASSISTANT_SERVICE_TOKEN")

SPECIALIST = {
    "investigate": "order",
    "request_refund": "payment",
    "cancel": "order",
    "failed_payments": "payment",
    "pending_approvals": "payment",
    "delayed_shipments": "shipping",
    "attention": None,  # coordinator uses all three
    "workflow_failures": None,
    "integrations": None,
}

RULES = (
    "Use ONLY the facts provided. Never invent orders, amounts, statuses or outcomes. "
    "Amounts are integer paise (100 paise = ₹1); show rupees. If a fact is missing, say so. "
    "You cannot take actions; refunds always need manager approval and shipped/delayed/delivered orders cannot be cancelled."
)


class Req(BaseModel):
    question: str
    intent: str
    summary: str
    facts: object | None = None


@app.get("/health")
def health():
    return {"ok": True, "llm": bool(os.environ.get("GROQ_API_KEY")), "model": MODEL}


@app.post("/analyze")
def analyze(req: Req, authorization: str | None = Header(default=None)):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(503, "GROQ_API_KEY not configured")

    from crewai import Agent, Crew, LLM, Process, Task

    llm = LLM(model=MODEL, temperature=0.2)
    agents = {
        "order": Agent(role="Order Intelligence Agent", goal="Explain order status and spot unusual order situations", backstory=RULES, llm=llm, allow_delegation=False, verbose=False),
        "payment": Agent(role="Payment Intelligence Agent", goal="Explain payment failures, refunds and refund eligibility", backstory=RULES, llm=llm, allow_delegation=False, verbose=False),
        "shipping": Agent(role="Shipping Intelligence Agent", goal="Explain shipping delays and unresolved shipment issues", backstory=RULES, llm=llm, allow_delegation=False, verbose=False),
    }
    coordinator = Agent(role="Operations Coordinator", goal="Give an operations employee a concise, accurate picture and clear next steps", backstory=RULES, llm=llm, allow_delegation=False, verbose=False)

    facts = json.dumps(req.facts, default=str)[:12000]
    context = f"Question: {req.question}\nDeterministic summary:\n{req.summary}\nFacts (JSON):\n{facts}"

    # One specialist (or none) + coordinator: at most two LLM calls, no agent-to-agent chatter.
    tasks = []
    spec = SPECIALIST.get(req.intent)
    if spec:
        tasks.append(Task(description=f"{context}\n\nAnalyse this from your specialist angle in 3-5 bullet points.", expected_output="3-5 factual bullet points", agent=agents[spec]))
    tasks.append(
        Task(
            description=f"{context}\n\nWrite the final answer for the employee: a 1-2 sentence diagnosis, then 'Next steps:' with up to 3 concrete steps. Under 140 words. Plain text.",
            expected_output="Short diagnosis and next steps",
            agent=coordinator,
            context=tasks[:],
        )
    )
    crew = Crew(agents=[*( [agents[spec]] if spec else []), coordinator], tasks=tasks, process=Process.sequential, verbose=False)
    result = crew.kickoff()
    return {"narrative": str(result).strip(), "model": MODEL}
