"use client";
import Link from "next/link";
import { useState } from "react";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { api, Badge, Button, Callout, Card, Empty, ErrorBox, Field, inputCls, inr, Modal, PageHeader, Segmented, SkeletonBlock, Table, td, tr, useApi, useToast, when, fullDate } from "@/components/ui";
import { useCan } from "@/components/session";

type A = {
  id: string; status: string; createdAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
  refund: { id: string; orderId: string; amountMinor: number; status: string; reason: string | null; requestedBy: string; source: string; error: string | null; externalId: string | null; order: { status: string; amountMinor: number; customer: { name: string; email: string }; payment: { status: string; amountMinor: number } | null } };
};

export default function Approvals() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const all = useApi<A[]>("/api/approvals");
  const canDecide = useCan("refund.approve");
  const toast = useToast();
  const [target, setTarget] = useState<{ a: A; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pending = (all.data ?? []).filter((a) => a.status === "pending");
  const history = (all.data ?? []).filter((a) => a.status !== "pending");
  const pendingTotal = pending.reduce((s, a) => s + a.refund.amountMinor, 0);

  async function decide() {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ status: string; error: string | null; externalId: string | null }>(`/api/approvals/${target.a.id}`, { json: { decision: target.decision, note: note || undefined } });
      if (target.decision === "reject") toast("info", `${inr(target.a.refund.amountMinor)} for ${target.a.refund.orderId} will not be paid.`, "Refund rejected");
      else if (r.status === "succeeded") toast("success", `Payment service confirmed refund ${r.externalId}.`, `Refunded ${inr(target.a.refund.amountMinor)}`);
      else toast("error", r.error ?? `Refund is ${r.status}.`, `Approved, but the refund ${r.status}`);
      setTarget(null);
      setNote("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      all.reload();
    }
  }

  return (
    <div className="anim-in">
      <PageHeader
        title="Refund approvals"
        description={canDecide ? "Every refund waits here for a manager. Approving sends it to the Payment service and records the real outcome." : "Only managers can approve or reject refunds. You can follow each request's status here."}
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: "pending", label: "Pending", count: pending.length }, { value: "history", label: "History", count: history.length }]} />}
      />
      {all.error ? <ErrorBox error={all.error} onRetry={all.reload} /> : !all.data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-52" />)}</div>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <Card><Empty title="No refunds waiting for approval" hint="New refund requests from operators, workflows or Nova Intelligence will appear here." icon={<ShieldCheck className="size-5" />} /></Card>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 text-[13px] text-fg-2"><span className="num font-semibold text-fg">{inr(pendingTotal)}</span> across {pending.length} request{pending.length > 1 ? "s" : ""} · oldest {when(pending[pending.length - 1].createdAt)}</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pending.map((a) => {
                const captured = a.refund.order.payment?.amountMinor ?? 0;
                const pct = captured ? Math.round((a.refund.amountMinor / captured) * 100) : 0;
                return (
                  <article key={a.id} className="flex flex-col rounded-card border border-line bg-surface shadow-card">
                    <div className="flex items-start justify-between gap-3 p-4 pb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><Link href={`/orders/${a.refund.orderId}`} className="font-mono text-[13px] font-semibold hover:text-accent">{a.refund.orderId}</Link><Badge status={a.refund.order.status} /></div>
                        <div className="mt-0.5 truncate text-[12px] text-fg-3">{a.refund.order.customer.name} · {a.refund.order.customer.email}</div>
                      </div>
                      <div className="text-right">
                        <div className="num text-[20px] font-semibold leading-none tracking-tight">{inr(a.refund.amountMinor)}</div>
                        <div className="mt-1 text-[11px] text-fg-3">{pct}% of {inr(captured)} captured</div>
                      </div>
                    </div>
                    <div className="mx-4 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-warn" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    <dl className="space-y-1.5 px-4 py-3 text-[12px]">
                      <div className="flex justify-between gap-3"><dt className="text-fg-3">Requested by</dt><dd className="flex items-center gap-1 font-medium">{a.refund.source === "workflow" && <Bot className="size-3.5 text-fg-3" />}{a.refund.requestedBy}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-fg-3">Source</dt><dd className="capitalize">{a.refund.source}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-fg-3">Waiting</dt><dd>{when(a.createdAt)}</dd></div>
                    </dl>
                    {a.refund.reason && <p className="mx-4 mb-3 rounded-md bg-subtle px-2.5 py-2 text-[12px] text-fg-2">“{a.refund.reason}”</p>}
                    <div className="mt-auto flex gap-2 border-t border-line p-3">
                      {canDecide ? (
                        <>
                          <Button className="flex-1" onClick={() => { setErr(null); setTarget({ a, decision: "reject" }); }} icon={<X className="size-3.5" />}>Reject</Button>
                          <Button className="flex-1" variant="primary" onClick={() => { setErr(null); setTarget({ a, decision: "approve" }); }} icon={<Check className="size-3.5" />}>Approve</Button>
                        </>
                      ) : <span className="flex-1 py-1 text-center text-[12px] text-fg-3">Awaiting a manager&apos;s decision</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )
      ) : (
        <Card pad={false}>
          {history.length === 0 ? <Empty title="No decisions yet" /> : (
            <Table head={["Order", "Customer", { label: "Amount", align: "right" }, "Decision", "Decided by", "Refund outcome", "Payment ref"]}>
              {history.map((a) => (
                <tr key={a.id} className={tr + " align-top"}>
                  <td className={td}><Link href={`/orders/${a.refund.orderId}`} className="font-mono text-[12px] font-medium hover:text-accent">{a.refund.orderId}</Link></td>
                  <td className={td}>{a.refund.order.customer.name}<div className="text-[12px] text-fg-3">requested by {a.refund.requestedBy}</div></td>
                  <td className={td + " num text-right font-semibold"}>{inr(a.refund.amountMinor)}</td>
                  <td className={td}><Badge status={a.status} />{a.decisionNote && <div className="mt-1 max-w-48 text-[12px] text-fg-3">“{a.decisionNote}”</div>}</td>
                  <td className={td}>{a.decidedBy}<div className="text-[12px] text-fg-3">{a.decidedAt ? fullDate(a.decidedAt) : ""}</div></td>
                  <td className={td}><Badge status={a.refund.status} />{a.refund.error && <div className="mt-1 max-w-64 text-[12px] text-bad">{a.refund.error}</div>}</td>
                  <td className={td + " font-mono text-[12px] text-fg-2"}>{a.refund.externalId ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} size="md"
        title={target ? `${target.decision === "approve" ? "Approve" : "Reject"} ${inr(target.a.refund.amountMinor)} refund?` : ""}
        description={target ? `${target.a.refund.orderId} · ${target.a.refund.order.customer.name} · requested by ${target.a.refund.requestedBy}` : undefined}
        footer={<><Button onClick={() => setTarget(null)}>Back</Button><Button variant={target?.decision === "approve" ? "primary" : "danger"} loading={busy} onClick={decide}>{target?.decision === "approve" ? "Approve and refund" : "Reject request"}</Button></>}>
        {target?.decision === "approve" ? <Callout tone="warn">The refund is sent to the Payment service immediately. If the service reports a failure, it&apos;s recorded as failed — not as paid.</Callout> : <Callout>The customer is not refunded. The requester can see your decision and note.</Callout>}
        {err && <ErrorBox error={err} />}
        <Field label="Decision note" hint="Optional — stored with the approval and in the audit log."><input data-autofocus className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
