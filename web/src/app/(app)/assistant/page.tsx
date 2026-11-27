"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowUp, Ban, Check, CreditCard, Database, RotateCcw, Search, ShieldCheck, Sparkles, Truck, Workflow } from "lucide-react";
import { api, Badge, Button, clsx, inr, useToast } from "@/components/ui";
import { useMe } from "@/components/session";

type Proposal = { kind: "refund" | "cancel"; orderId: string; amountMinor?: number; label: string };
type Reply = { intent: string; answer: string; narrative?: string | null; engine: string; links: { label: string; href: string }[]; proposal?: Proposal | null; notice?: string };
type Msg = { role: "user" | "assistant"; text: string; reply?: Reply; done?: { ok: boolean; text: string }; error?: boolean };

const SUGGESTIONS = [
  { text: "Which orders need attention?", icon: AlertTriangle },
  { text: "Investigate NC-1004", icon: Search },
  { text: "Find delayed shipments", icon: Truck },
  { text: "Analyze failed payments", icon: CreditCard },
  { text: "Show pending refund approvals", icon: ShieldCheck },
  { text: "Which workflows failed recently?", icon: Workflow },
];
const INTENTS: Record<string, string> = {
  investigate: "Order investigation", delayed_shipments: "Shipment lookup", failed_payments: "Payment analysis", pending_approvals: "Approval queue",
  workflow_failures: "Workflow history", integrations: "Integration status", attention: "Operations scan", request_refund: "Refund eligibility check", cancel: "Cancellation check", help: "Capabilities",
};

/** Render text with bullet lists and clickable NC-#### order references. */
function Rich({ text }: { text: string }) {
  const linkify = (s: string): ReactNode[] =>
    s.split(/(NC-\d{4})/g).map((part, i) =>
      /^NC-\d{4}$/.test(part) ? <Link key={i} href={`/orders/${part}`} className="rounded bg-accent-soft px-1 font-mono text-[12px] font-medium text-accent hover:underline">{part}</Link> : part,
    );
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`} className="my-1.5 space-y-1">{list.map((l, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-3" /><span>{linkify(l)}</span></li>)}</ul>);
    list = [];
  };
  for (const l of lines) {
    if (/^[•\-]\s/.test(l)) list.push(l.replace(/^[•\-]\s/, ""));
    else {
      flush();
      if (l.trim()) out.push(<p key={`p${out.length}`} className={clsx(/^⚠/.test(l) && "text-warn")}>{linkify(l)}</p>);
    }
  }
  flush();
  return <div className="space-y-1.5 leading-relaxed">{out}</div>;
}

function Assistant() {
  const me = useMe();
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);
  useEffect(() => {
    const q = sp.get("q");
    if (q && !started.current) {
      started.current = true;
      router.replace("/assistant", { scroll: false });
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await api<Reply>("/api/assistant", { json: { message: text } });
      setMsgs((m) => [...m, { role: "assistant", text: reply.answer, reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function confirm(i: number, p: Proposal) {
    setConfirming(i);
    try {
      if (p.kind === "refund") await api(`/api/orders/${p.orderId}/refunds`, { json: { amount_minor: p.amountMinor, reason: "Requested via Nova Intelligence" } });
      else await api(`/api/orders/${p.orderId}/cancel`, { json: { reason: "Requested via Nova Intelligence" } });
      const text = p.kind === "refund" ? `Refund of ${inr(p.amountMinor!)} for ${p.orderId} submitted — it's now waiting for manager approval.` : `${p.orderId} was cancelled in Commerce.`;
      setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: { ok: true, text } } : x)));
      toast("success", text);
    } catch (e) {
      setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: { ok: false, text: (e as Error).message } } : x)));
    } finally {
      setConfirming(null);
    }
  }

  const empty = msgs.length === 0;

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-52px)] flex-col sm:-mx-6 lg:-mx-8">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          {empty ? (
            <div className="anim-in pt-[6vh] text-center">
              <div className="relative mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-line bg-surface shadow-card">
                <Sparkles className="size-6 text-violet" />
                <span className="absolute -inset-px -z-10 rounded-2xl bg-gradient-to-br from-violet/25 to-accent/20 blur-lg" />
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Nova Intelligence</h1>
              <p className="mt-1 text-[14px] text-fg-2">AI Operations Copilot</p>
              <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.12em] text-fg-3">Understand · Investigate · Resolve</p>
              <div className="mx-auto mt-8 grid max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s.text} onClick={() => send(s.text)} className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-left text-[13px] shadow-card transition-all hover:-translate-y-px hover:border-line-strong">
                    <span className="grid size-7 place-items-center rounded-md bg-subtle text-fg-3 transition-colors group-hover:bg-accent-soft group-hover:text-accent"><s.icon className="size-3.5" /></span>
                    {s.text}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-[12px] text-fg-3">Answers come from live application data. Actions need your confirmation and follow the same permissions and approvals as the rest of the app. You&apos;re signed in as <span className="font-medium capitalize text-fg-2">{me.role}</span>.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="anim-in flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[14px] text-canvas">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="anim-in flex gap-3">
                    <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface"><Sparkles className="size-3.5 text-violet" /></div>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      {m.error ? (
                        <div className="rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-[13px]"><div className="font-medium text-bad">Nova couldn&apos;t answer that</div><div className="text-fg-2">{m.text}</div></div>
                      ) : (
                        <>
                          {m.reply && m.reply.intent !== "help" && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5"><Database className="size-3" />{INTENTS[m.reply.intent] ?? m.reply.intent}</span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5"><Check className="size-3 text-ok" />Read live data</span>
                              <Badge tone={m.reply.engine === "crewai" ? "violet" : "neutral"} dot={false}>{m.reply.engine === "crewai" ? "CrewAI · Groq" : "Rule-based"}</Badge>
                            </div>
                          )}
                          {m.reply?.narrative && <div className="rounded-xl border border-violet/20 bg-violet-soft/50 px-4 py-3 text-[14px]"><Rich text={m.reply.narrative} /></div>}
                          <div className={clsx("rounded-xl border border-line bg-surface px-4 py-3 shadow-card", m.reply?.narrative ? "text-[13px] text-fg-2" : "text-[14px]")}>
                            {m.reply?.narrative && <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3">Data behind this answer</div>}
                            <Rich text={m.text} />
                          </div>
                          {m.reply?.notice && <p className="text-[12px] text-fg-3">{m.reply.notice}</p>}
                          {m.reply?.links.length ? (
                            <div className="flex flex-wrap gap-1.5">{m.reply.links.map((l) => <Link key={l.href} href={l.href} className="rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg">{l.label} →</Link>)}</div>
                          ) : null}
                          {m.reply?.proposal && !m.done && (
                            <div className="rounded-xl border border-warn/30 bg-warn-soft/60 p-4">
                              <div className="flex items-start gap-3">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-warn shadow-card">{m.reply.proposal.kind === "refund" ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-semibold">Confirm action</div>
                                  <div className="text-[13px] text-fg-2">
                                    {m.reply.proposal.kind === "refund" ? <>Submit a <span className="num font-medium text-fg">{inr(m.reply.proposal.amountMinor!)}</span> refund request for <span className="font-mono">{m.reply.proposal.orderId}</span>. A manager must approve it before any money moves.</> : <>Send a cancellation for <span className="font-mono">{m.reply.proposal.orderId}</span> to Commerce.</>}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 flex justify-end gap-2">
                                <Button size="sm" onClick={() => setMsgs((ms) => ms.map((x, j) => (j === i ? { ...x, done: { ok: false, text: "Dismissed — nothing was changed." } } : x)))}>Dismiss</Button>
                                <Button size="sm" variant={m.reply.proposal.kind === "cancel" ? "danger" : "primary"} loading={confirming === i} onClick={() => confirm(i, m.reply!.proposal!)}>{m.reply.proposal.label}</Button>
                              </div>
                            </div>
                          )}
                          {m.done && <div className={clsx("flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]", m.done.ok ? "bg-ok-soft text-fg" : "bg-subtle text-fg-2")}>{m.done.ok ? <Check className="size-4 text-ok" /> : <Ban className="size-4 text-fg-3" />}{m.done.text}</div>}
                        </>
                      )}
                    </div>
                  </div>
                ),
              )}
              {busy && (
                <div className="anim-in flex gap-3">
                  <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface"><Sparkles className="size-3.5 text-violet" /></div>
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-fg-2 shadow-card">
                    <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="typing-dot size-1.5 rounded-full bg-fg-3" style={{ animationDelay: `${d * 0.15}s` }} />)}</span>
                    Investigating live data…
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-line bg-canvas/90 backdrop-blur">
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
          {!empty && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {SUGGESTIONS.slice(0, 4).map((s) => <button type="button" key={s.text} onClick={() => send(s.text)} disabled={busy} className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50">{s.text}</button>)}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-1.5 shadow-card transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
            <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message Nova Intelligence"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about an order, payments, shipments or refunds…" className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] text-fg placeholder:text-fg-3 focus:outline-none" />
            <Button type="submit" variant="primary" disabled={!input.trim()} loading={busy} aria-label="Send" icon={!busy ? <ArrowUp className="size-4" /> : undefined} />
          </div>
          <p className="mt-1.5 text-center text-[11px] text-fg-3">Nova reads application data only. It can&apos;t approve refunds or bypass cancellation rules.</p>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Assistant /></Suspense>;
}
