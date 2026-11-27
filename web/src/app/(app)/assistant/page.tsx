"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { api, Badge, Button, Card, inr, useToast } from "@/components/ui";
import { useMe } from "@/components/session";

type Proposal = { kind: "refund" | "cancel"; orderId: string; amountMinor?: number; label: string };
type Reply = { intent: string; answer: string; narrative?: string | null; engine: string; links: { label: string; href: string }[]; proposal?: Proposal | null; notice?: string };
type Msg = { role: "user" | "assistant"; text: string; reply?: Reply; done?: string };

const SUGGESTIONS = ["Which orders need immediate attention?", "Show me all delayed shipments", "Analyze failed payments", "Which refunds are waiting for approval?", "Investigate NC-1004", "Explain why NC-1010 refund failed", "Which workflows failed recently?", "Request a refund for order NC-1005"];

export default function Assistant() {
  const me = useMe();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await api<Reply>("/api/assistant", { json: { message: text } });
      setMsgs((m) => [...m, { role: "assistant", text: reply.answer, reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Something went wrong: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function confirm(i: number, p: Proposal) {
    try {
      if (p.kind === "refund") {
        await api(`/api/orders/${p.orderId}/refunds`, { json: { amount_minor: p.amountMinor, reason: "Requested via Nova Intelligence" } });
        setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: `Refund of ${inr(p.amountMinor!)} submitted for approval.` } : x)));
      } else {
        await api(`/api/orders/${p.orderId}/cancel`, { json: { reason: "Requested via Nova Intelligence" } });
        setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: `${p.orderId} cancelled in Commerce.` } : x)));
      }
      toast("success", "Done");
    } catch (e) {
      setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: `Failed: ${(e as Error).message}` } : x)));
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6.5rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-ink-900 text-accent-500"><Sparkles className="size-5" /></div>
        <div>
          <h1 className="text-[18px] font-semibold leading-tight">Nova Intelligence</h1>
          <p className="text-[12px] text-ink-500">AI Operations Copilot · Understand. Investigate. Resolve. · answers come from live application data, acting as <span className="capitalize">{me.role}</span></p>
        </div>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col" pad={false}>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-md border border-ink-200 px-3 py-2 text-left text-[12px] text-ink-700 hover:border-ink-300 hover:bg-ink-50">{s}</button>)}
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[80%] rounded-lg bg-ink-900 px-3 py-2 text-white">{m.text}</div>
            ) : (
              <div key={i} className="max-w-[90%] space-y-2">
                {m.reply?.narrative && <div className="whitespace-pre-wrap rounded-lg border border-accent-100 bg-accent-50/60 px-3 py-2 leading-relaxed">{m.reply.narrative}</div>}
                <div className={`whitespace-pre-wrap rounded-lg border border-ink-200 px-3 py-2 leading-relaxed ${m.reply?.narrative ? "bg-white text-[12px] text-ink-600" : "bg-ink-50"}`}>
                  {m.reply?.narrative && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Data behind this answer</div>}
                  {m.text}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.reply && <Badge tone={m.reply.engine === "crewai" ? "violet" : "gray"}>{m.reply.engine === "crewai" ? "CrewAI + Groq" : "rule-based"}</Badge>}
                  {m.reply?.links.map((l) => <Link key={l.href} href={l.href} className="text-[12px] text-accent-700 hover:underline">{l.label} →</Link>)}
                </div>
                {m.reply?.notice && <p className="text-[11px] text-ink-500">{m.reply.notice}</p>}
                {m.reply?.proposal && !m.done && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <span className="flex-1 text-[12px] text-amber-900">Confirmation needed</span>
                    <Button size="sm" variant="primary" onClick={() => confirm(i, m.reply!.proposal!)}>{m.reply.proposal.label}</Button>
                  </div>
                )}
                {m.done && <p className="text-[12px] font-medium text-ink-700">{m.done}</p>}
              </div>
            ),
          )}
          {busy && <div className="text-[12px] text-ink-500">Investigating…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-ink-100 p-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about orders, payments, shipments, refunds…" className="h-9 flex-1 rounded-md border border-ink-200 px-3 focus:border-accent-500 focus:outline-none" />
          <Button type="submit" variant="primary" loading={busy}><Send className="size-3.5" />Ask</Button>
        </form>
      </Card>
    </div>
  );
}
