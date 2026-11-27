"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Badge, Button, Card, Empty, ErrorBox, Field, inputCls, inr, Modal, PageHeader, Skeleton, Table, td, useApi, useToast, when } from "@/components/ui";
import { useCan } from "@/components/session";

type A = {
  id: string; status: string; createdAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
  refund: { id: string; orderId: string; amountMinor: number; status: string; reason: string | null; requestedBy: string; source: string; error: string | null; externalId: string | null; order: { status: string; customer: { name: string }; payment: { status: string; amountMinor: number } | null } };
};

export default function Approvals() {
  const [tab, setTab] = useState<"pending" | "">("pending");
  const { data, error, loading, reload } = useApi<A[]>(`/api/approvals${tab ? "?status=pending" : ""}`);
  const canDecide = useCan("refund.approve");
  const toast = useToast();
  const [target, setTarget] = useState<{ a: A; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide() {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ status: string; error: string | null }>(`/api/approvals/${target.a.id}`, { json: { decision: target.decision, note: note || undefined } });
      if (target.decision === "reject") toast("info", "Refund rejected");
      else if (r.status === "succeeded") toast("success", "Approved — Payment service confirmed the refund");
      else toast("error", `Approved, but the refund ${r.status}: ${r.error ?? ""}`);
      setTarget(null);
      setNote("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  }

  return (
    <>
      <PageHeader title="Refund approvals" subtitle={canDecide ? "Approve to send the refund to the Payment service, or reject it." : "Only managers can approve or reject. You can follow the status here."}
        actions={<div className="flex rounded-md border border-ink-200 bg-white p-0.5">{(["pending", ""] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded px-2.5 py-1 text-[12px] ${tab === t ? "bg-ink-900 text-white" : "text-ink-600"}`}>{t ? "Pending" : "All"}</button>)}</div>} />
      <Card pad={false}>
        {error ? <div className="p-3"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={6} /></div> : !data?.length ? <Empty title={tab ? "No refunds waiting for approval" : "No approvals yet"} /> : (
          <Table head={["Order", "Customer", "Amount", "Captured", "Requested by", "Reason", "Approval", "Refund", ""]}>
            {data.map((a) => (
              <tr key={a.id}>
                <td className={td}><Link href={`/orders/${a.refund.orderId}`} className="font-mono text-[12px] font-medium hover:underline">{a.refund.orderId}</Link><div><Badge status={a.refund.order.status} /></div></td>
                <td className={td}>{a.refund.order.customer.name}</td>
                <td className={td + " num font-semibold"}>{inr(a.refund.amountMinor)}</td>
                <td className={td + " num text-ink-500"}>{inr(a.refund.order.payment?.amountMinor)}</td>
                <td className={td}>{a.refund.requestedBy}<div className="text-[11px] text-ink-500">{a.refund.source} · {when(a.createdAt)}</div></td>
                <td className={td + " max-w-48 text-[12px] text-ink-600"}>{a.refund.reason ?? "—"}</td>
                <td className={td}><Badge status={a.status} />{a.decidedBy && <div className="text-[11px] text-ink-500">{a.decidedBy} · {when(a.decidedAt)}</div>}</td>
                <td className={td}><Badge status={a.refund.status} />{a.refund.error && <div className="max-w-48 text-[11px] text-rose-600">{a.refund.error}</div>}</td>
                <td className={td + " whitespace-nowrap text-right"}>
                  {a.status === "pending" && canDecide && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => setTarget({ a, decision: "reject" })}>Reject</Button>
                      <Button size="sm" variant="primary" onClick={() => setTarget({ a, decision: "approve" })}>Approve</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={!!target} onClose={() => setTarget(null)} title={target ? `${target.decision === "approve" ? "Approve" : "Reject"} ${inr(target.a.refund.amountMinor)} refund for ${target.a.refund.orderId}?` : ""}
        footer={<><Button onClick={() => setTarget(null)}>Back</Button><Button variant={target?.decision === "approve" ? "primary" : "danger"} loading={busy} onClick={decide}>{target?.decision === "approve" ? "Approve and refund" : "Reject"}</Button></>}>
        {target?.decision === "approve" && <p className="text-[13px] text-ink-600">The refund is sent to the Payment service immediately. The result is recorded as the service reports it.</p>}
        {err && <ErrorBox error={err} />}
        <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
