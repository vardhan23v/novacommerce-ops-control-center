"use client";
import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, Ban, LifeBuoy, RefreshCw, RotateCcw } from "lucide-react";
import { api, Badge, Button, Card, Empty, ErrorBox, Field, fullDate, inputCls, inr, Modal, PageHeader, Skeleton, Table, td, useApi, useToast, when } from "@/components/ui";
import { useCan } from "@/components/session";

type Order = {
  id: string; status: string; amountMinor: number; currency: string; channel: string; createdAt: string; syncedAt: string;
  customer: { id: string; name: string; email: string };
  payment: { id: string; status: string; amountMinor: number } | null;
  shipment: { id: string; status: string; updatedAt: string; lastSyncError: string | null; lastSyncErrorAt: string | null } | null;
  refunds: { id: string; amountMinor: number; status: string; externalId: string | null; error: string | null; requestedBy: string; source: string; createdAt: string; approval: { status: string; decidedBy: string | null; decisionNote: string | null } | null }[];
  tickets: { id: string; externalId: string | null; reason: string; status: string; error: string | null; createdBy: string; createdAt: string }[];
  operations: { id: string; type: string; status: string; detail: string | null; actor: string; createdAt: string }[];
  audits: { id: string; actor: string; action: string; outcome: string; createdAt: string; details: Record<string, unknown> | null }[];
  executions: { id: string; status: string; detail: string; createdAt: string; workflow: { name: string } }[];
  eligibility: { cancel: string | null; refund: string | null; refundableMinor: number };
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}

export default function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: o, error, loading, reload } = useApi<Order>(`/api/orders/${id}`);
  const toast = useToast();
  const canCancel = useCan("order.cancel");
  const canRefund = useCan("refund.request");
  const canTicket = useCan("ticket.create");
  const [modal, setModal] = useState<null | "cancel" | "refund" | "ticket">(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
      toast("success", ok);
      setModal(null);
      setReason("");
      setAmount("");
    } catch (e) {
      setFormError((e as Error).message);
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const r = await api<{ issues: { service: string; error: string }[] }>(`/api/orders/${id}/refresh`, { method: "POST" });
      if (r.issues.length) toast("error", `Refreshed with errors: ${r.issues.map((i) => `${i.service}: ${i.error}`).join("; ")}`);
      else toast("success", "Refreshed from Commerce, Payment and Shipping");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !o) return <Skeleton rows={10} />;
  if (!o) return null;

  const amountMinor = (() => {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.replace(/[,₹\s]/g, ""));
    return m ? parseInt(m[1]) * 100 + parseInt((m[2] ?? "0").padEnd(2, "0")) : null;
  })();

  return (
    <>
      <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800"><ArrowLeft className="size-3.5" />Orders</Link>
      <PageHeader
        title={o.id}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge status={o.status} /> {inr(o.amountMinor)} · {o.channel} · placed {fullDate(o.createdAt)} · synced {when(o.syncedAt)}</span>}
        actions={
          <>
            <Button onClick={refresh} loading={busy && !modal}><RefreshCw className="size-3.5" />Refresh</Button>
            {canTicket && <Button onClick={() => setModal("ticket")}><LifeBuoy className="size-3.5" />Ticket</Button>}
            {canRefund && <Button onClick={() => { setAmount(String(o.eligibility.refundableMinor / 100)); setModal("refund"); }} disabled={!!o.eligibility.refund} title={o.eligibility.refund ?? ""}><RotateCcw className="size-3.5" />Request refund</Button>}
            {canCancel && <Button variant="danger" onClick={() => setModal("cancel")} disabled={!!o.eligibility.cancel} title={o.eligibility.cancel ?? ""}><Ban className="size-3.5" />Cancel order</Button>}
          </>
        }
      />
      {o.shipment?.lastSyncError && (
        <div className="mb-4"><ErrorBox error={`Shipping service lookup failed ${when(o.shipment.lastSyncErrorAt)}: ${o.shipment.lastSyncError}. Showing last known shipment data.`} /></div>
      )}
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-md border border-ink-200 bg-white px-2 py-1">Cancel: {o.eligibility.cancel ? <span className="text-ink-500">{o.eligibility.cancel}</span> : <span className="text-emerald-700">eligible</span>}</span>
        <span className="rounded-md border border-ink-200 bg-white px-2 py-1">Refund: {o.eligibility.refund ? <span className="text-ink-500">{o.eligibility.refund}</span> : <span className="text-emerald-700">eligible up to {inr(o.eligibility.refundableMinor)}</span>}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Customer"><dl><Row k="Name" v={o.customer.name} /><Row k="Email" v={o.customer.email} /><Row k="Customer ID" v={<span className="font-mono">{o.customer.id}</span>} /></dl></Card>
        <Card title="Payment">{o.payment ? <dl><Row k="Status" v={<Badge status={o.payment.status} />} /><Row k="Captured" v={inr(o.payment.status === "captured" ? o.payment.amountMinor : 0)} /><Row k="Transaction" v={<span className="font-mono">{o.payment.id}</span>} /><Row k="Refundable" v={inr(o.eligibility.refundableMinor)} /></dl> : <Empty title="No payment record" />}</Card>
        <Card title="Shipment">{o.shipment ? <dl><Row k="Status" v={<Badge status={o.shipment.status} />} /><Row k="Shipment" v={<span className="font-mono">{o.shipment.id}</span>} /><Row k="Carrier update" v={fullDate(o.shipment.updatedAt)} /></dl> : <Empty title="No shipment record" />}</Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Refunds" pad={false}>
          {o.refunds.length === 0 ? <Empty title="No refunds" /> : (
            <Table head={["Amount", "Status", "Requested", "Approval", "Payment ref"]}>
              {o.refunds.map((r) => (
                <tr key={r.id}>
                  <td className={td + " num font-medium"}>{inr(r.amountMinor)}</td>
                  <td className={td}><Badge status={r.status} />{r.error && <div className="mt-0.5 max-w-56 text-[11px] text-rose-600">{r.error}</div>}</td>
                  <td className={td + " text-[12px]"}>{r.requestedBy}<div className="text-[11px] text-ink-500">{r.source} · {when(r.createdAt)}</div></td>
                  <td className={td + " text-[12px]"}>{r.approval ? <><Badge status={r.approval.status} />{r.approval.decidedBy && <div className="text-[11px] text-ink-500">{r.approval.decidedBy}</div>}</> : "—"}</td>
                  <td className={td + " font-mono text-[11px]"}>{r.externalId ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Support tickets" pad={false}>
          {o.tickets.length === 0 ? <Empty title="No tickets" /> : (
            <ul className="divide-y divide-ink-100">
              {o.tickets.map((t) => (
                <li key={t.id} className="px-4 py-2">
                  <div className="flex items-center justify-between"><span className="font-mono text-[12px]">{t.externalId ?? "not created"}</span><Badge status={t.status} /></div>
                  <div className="text-[12px]">{t.reason}</div>
                  {t.error && <div className="text-[11px] text-rose-600">{t.error}</div>}
                  <div className="text-[11px] text-ink-500">{t.createdBy} · {when(t.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Operations & automations" pad={false}>
          {o.operations.length + o.executions.length === 0 ? <Empty title="No operations yet" /> : (
            <ul className="divide-y divide-ink-100">
              {o.operations.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 px-4 py-2">
                  <div><span className="font-medium capitalize">{p.type}</span> by {p.actor}{p.detail && <div className="text-[11px] text-ink-500">{p.detail}</div>}</div>
                  <div className="text-right"><Badge status={p.status} /><div className="text-[10px] text-ink-400">{when(p.createdAt)}</div></div>
                </li>
              ))}
              {o.executions.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 px-4 py-2">
                  <div><span className="font-medium">Workflow: {e.workflow.name}</span><div className="text-[11px] text-ink-500">{e.detail}</div></div>
                  <div className="text-right"><Badge status={e.status} /><div className="text-[10px] text-ink-400">{when(e.createdAt)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Audit trail" pad={false}>
          {o.audits.length === 0 ? <Empty title="No audit events" /> : (
            <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
              {o.audits.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 px-4 py-2">
                  <div className="min-w-0"><span className="font-medium">{a.actor}</span> <span className="text-ink-500">{a.action}</span>
                    {a.details && <div className="truncate text-[11px] text-ink-500">{Object.entries(a.details).filter(([, v]) => typeof v !== "object").map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}
                  </div>
                  <div className="shrink-0 text-right"><Badge status={a.outcome} /><div className="text-[10px] text-ink-400">{when(a.createdAt)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={modal === "cancel"} onClose={() => setModal(null)} title={`Cancel ${o.id}?`}
        footer={<><Button onClick={() => setModal(null)}>Keep order</Button><Button variant="danger" loading={busy} onClick={() => act(() => api(`/api/orders/${o.id}/cancel`, { json: { reason: reason || undefined } }), `${o.id} cancelled in Commerce`)}>Cancel order</Button></>}>
        <p className="text-[13px] text-ink-600">The cancellation is sent to the Commerce system. The order is only marked cancelled here once Commerce confirms.</p>
        {formError && <ErrorBox error={formError} />}
        <Field label="Reason (optional)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
      <Modal open={modal === "refund"} onClose={() => setModal(null)} title={`Request refund for ${o.id}`}
        footer={<><Button onClick={() => setModal(null)}>Close</Button><Button variant="primary" loading={busy} disabled={!amountMinor} onClick={() => act(() => api(`/api/orders/${o.id}/refunds`, { json: { amount_minor: amountMinor, reason: reason || undefined } }), "Refund requested — waiting for manager approval")}>Submit for approval</Button></>}>
        <p className="text-[13px] text-ink-600">Refunds need manager approval. Nothing is sent to the Payment system until a manager approves.</p>
        {formError && <ErrorBox error={formError} />}
        <Field label="Amount (₹)" hint={`Up to ${inr(o.eligibility.refundableMinor)} refundable`}><input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
      <Modal open={modal === "ticket"} onClose={() => setModal(null)} title={`Open support ticket for ${o.id}`}
        footer={<><Button onClick={() => setModal(null)}>Close</Button><Button variant="primary" loading={busy} disabled={!reason.trim()} onClick={() => act(() => api(`/api/orders/${o.id}/tickets`, { json: { reason } }), "Support ticket created")}>Create ticket</Button></>}>
        {formError && <ErrorBox error={formError} />}
        <Field label="Reason"><textarea className={inputCls + " h-20 py-1.5"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
