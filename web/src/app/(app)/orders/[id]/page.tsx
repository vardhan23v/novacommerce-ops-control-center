"use client";
import Link from "next/link";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Ban, Bot, CheckCircle2, CircleSlash, CreditCard, LifeBuoy, Mail, MoreHorizontal, RefreshCw, RotateCcw, Sparkles, Truck, User, Workflow, XCircle } from "lucide-react";
import { api, Badge, Button, Callout, Card, clsx, Empty, ErrorBox, Field, fullDate, inputCls, inr, KeyValue, Menu, Modal, SkeletonBlock, Table, td, toneOf, useApi, useToast, when, StatusDot, titleCase, actionLabel } from "@/components/ui";
import { useCan } from "@/components/session";

type Order = {
  id: string; status: string; amountMinor: number; currency: string; channel: string; createdAt: string; syncedAt: string;
  customer: { id: string; name: string; email: string };
  payment: { id: string; status: string; amountMinor: number } | null;
  shipment: { id: string; status: string; updatedAt: string; lastSyncError: string | null; lastSyncErrorAt: string | null } | null;
  refunds: { id: string; amountMinor: number; status: string; externalId: string | null; error: string | null; reason: string | null; requestedBy: string; source: string; createdAt: string; approval: { status: string; decidedBy: string | null; decisionNote: string | null } | null }[];
  tickets: { id: string; externalId: string | null; reason: string; status: string; error: string | null; createdBy: string; createdAt: string }[];
  operations: { id: string; type: string; status: string; detail: string | null; actor: string; createdAt: string }[];
  audits: { id: string; actor: string; actorRole: string | null; action: string; outcome: string; createdAt: string; details: Record<string, unknown> | null }[];
  executions: { id: string; status: string; detail: string; createdAt: string; workflow: { name: string } }[];
  eligibility: { cancel: string | null; refund: string | null; refundableMinor: number };
};

type Ev = { id: string; at: string; kind: "operation" | "workflow" | "audit"; title: string; raw?: string; detail?: string; tone: ReturnType<typeof toneOf>; actor?: string };

function OrderDetail({ id }: { id: string }) {
  const { data: o, error, loading, reload } = useApi<Order>(`/api/orders/${id}`);
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const canCancel = useCan("order.cancel");
  const canRefund = useCan("refund.request");
  const canTicket = useCan("ticket.create");
  const [modal, setModal] = useState<null | "cancel" | "refund" | "ticket">(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "audit">("all");

  // Deep links from the orders table: ?action=cancel|refund|ticket
  useEffect(() => {
    const a = sp.get("action");
    if (!o || !a) return;
    if (a === "refund") setAmount(String(o.eligibility.refundableMinor / 100));
    if (a === "cancel" || a === "refund" || a === "ticket") setModal(a);
    router.replace(`/orders/${id}`, { scroll: false });
  }, [o, sp, id, router]);

  const open = (m: "cancel" | "refund" | "ticket") => {
    setFormError(null);
    setReason("");
    if (m === "refund" && o) setAmount(String(o.eligibility.refundableMinor / 100));
    setModal(m);
  };

  async function act(fn: () => Promise<unknown>, title: string, text: string) {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
      toast("success", text, title);
      setModal(null);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const r = await api<{ issues: { service: string; error: string }[] }>(`/api/orders/${id}/refresh`, { method: "POST" });
      if (r.issues.length) toast("error", r.issues.map((i) => `${titleCase(i.service)}: ${i.error}`).join(" · "), "Refreshed with errors");
      else toast("success", "Commerce, Payment and Shipping data is up to date.", "Order refreshed");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setRefreshing(false);
      reload();
    }
  }

  const timeline = useMemo<Ev[]>(() => {
    if (!o) return [];
    const ev: Ev[] = [
      { id: "created", at: o.createdAt, kind: "operation", title: `Order placed via ${o.channel}`, tone: "neutral", detail: inr(o.amountMinor) },
      ...o.operations.map((p) => ({ id: p.id, at: p.createdAt, kind: "operation" as const, title: `${titleCase(p.type)} ${p.status}`, detail: p.detail ?? undefined, tone: toneOf(p.status), actor: p.actor })),
      ...o.executions.map((e) => ({ id: e.id, at: e.createdAt, kind: "workflow" as const, title: `Workflow “${e.workflow.name}” ${e.status}`, detail: e.detail, tone: toneOf(e.status) })),
      ...o.audits.map((a) => ({
        id: a.id, at: a.createdAt, kind: "audit" as const, title: actionLabel(a.action), raw: a.action, tone: toneOf(a.outcome), actor: a.actor,
        detail: a.details ? describeDetails(a.details) : undefined,
      })),
    ];
    return ev.filter((e) => (tab === "all" ? e.kind !== "audit" || /^(refund|ticket|webhook)\./.test(e.raw ?? "") : e.kind === "audit")).sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [o, tab]);

  if (error) return <ErrorBox title={`Couldn't load ${id}`} error={error} onRetry={reload} />;
  if (loading && !o) return <div className="space-y-4"><SkeletonBlock className="h-16 w-96" /><div className="grid gap-4 lg:grid-cols-3"><SkeletonBlock className="h-64 lg:col-span-2" /><SkeletonBlock className="h-64" /></div></div>;
  if (!o) return null;

  const amountMinor = (() => {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.replace(/[,₹\s]/g, ""));
    return m ? parseInt(m[1]) * 100 + parseInt((m[2] ?? "0").padEnd(2, "0")) : null;
  })();
  const refundedOk = o.refunds.filter((r) => r.status === "succeeded").reduce((a, r) => a + r.amountMinor, 0);
  const refundedPending = o.refunds.filter((r) => ["pending_approval", "executing", "unconfirmed"].includes(r.status)).reduce((a, r) => a + r.amountMinor, 0);
  const captured = o.payment?.status === "captured" ? o.payment.amountMinor : 0;
  const amountError = amountMinor !== null && amountMinor > o.eligibility.refundableMinor ? `Maximum refundable is ${inr(o.eligibility.refundableMinor)}` : undefined;

  return (
    <div className="anim-in">
      <Link href="/orders" className="mb-3 inline-flex items-center gap-1 text-[12px] text-fg-3 transition-colors hover:text-fg"><ArrowLeft className="size-3.5" />All orders</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-semibold tracking-tight">{o.id}</h1>
            <Badge status={o.status} />
            {o.payment && <Badge status={o.payment.status}>Payment {o.payment.status}</Badge>}
            {o.shipment && <Badge status={o.shipment.status}>Shipment {o.shipment.status}</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-fg-2">
            {o.customer.name} · <span className="num font-medium text-fg">{inr(o.amountMinor)}</span> · <span className="capitalize">{o.channel}</span> · placed {fullDate(o.createdAt)} · synced {when(o.syncedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={refresh} loading={refreshing} icon={<RefreshCw className="size-3.5" />}>Refresh</Button>
          <Link href={`/assistant?q=${encodeURIComponent(`Investigate ${o.id}`)}`}><Button icon={<Sparkles className="size-3.5 text-violet" />}>Ask Nova</Button></Link>
          {canRefund && <Button variant="primary" onClick={() => open("refund")} disabled={!!o.eligibility.refund} title={o.eligibility.refund ?? undefined} icon={<RotateCcw className="size-3.5" />}>Request refund</Button>}
          {(canCancel || canTicket) && (
            <Menu
              trigger={(p) => <Button {...p} aria-label="More actions" icon={<MoreHorizontal className="size-4" />} />}
              items={[
                ...(canTicket ? [{ label: "Open support ticket", icon: <LifeBuoy />, onSelect: () => open("ticket") }] : []),
                ...(canCancel ? [{ label: "Cancel order", icon: <Ban />, danger: true, disabled: !!o.eligibility.cancel, hint: o.eligibility.cancel ?? undefined, onSelect: () => open("cancel") }] : []),
              ]}
            />
          )}
        </div>
      </div>

      {o.shipment?.lastSyncError && (
        <div className="mb-4"><Callout tone="bad"><span className="font-medium">Shipping lookup failed {when(o.shipment.lastSyncErrorAt)}</span> — {o.shipment.lastSyncError}. Showing the last known shipment data; refresh once the carrier recovers.</Callout></div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Eligibility ok={!o.eligibility.cancel} label="Cancellation" yes="Eligible — will be sent to Commerce" no={o.eligibility.cancel} />
        <Eligibility ok={!o.eligibility.refund} label="Refund" yes={`Eligible up to ${inr(o.eligibility.refundableMinor)} · manager approval required`} no={o.eligibility.refund} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            <Card title={<span className="flex items-center gap-2"><User className="size-3.5 text-fg-3" />Customer</span>}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{o.customer.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                <div className="min-w-0"><div className="truncate font-medium">{o.customer.name}</div><div className="font-mono text-[11px] text-fg-3">{o.customer.id}</div></div>
              </div>
              <a href={`mailto:${o.customer.email}`} className="flex items-center gap-1.5 truncate text-[12px] text-fg-2 hover:text-accent"><Mail className="size-3.5" />{o.customer.email}</a>
              <Link href={`/orders?q=${encodeURIComponent(o.customer.email)}`} className="mt-2 block text-[12px] font-medium text-accent hover:underline">View customer&apos;s orders</Link>
            </Card>
            <Card title={<span className="flex items-center gap-2"><CreditCard className="size-3.5 text-fg-3" />Payment</span>}>
              {o.payment ? <KeyValue items={[["Status", <Badge key="s" status={o.payment.status} />], ["Transaction", <span key="t" className="font-mono text-[12px]">{o.payment.id}</span>], ["Amount", inr(o.payment.amountMinor)]]} /> : <Empty title="No payment record" />}
            </Card>
            <Card title={<span className="flex items-center gap-2"><Truck className="size-3.5 text-fg-3" />Shipment</span>}>
              {o.shipment ? <KeyValue items={[["Status", <Badge key="s" status={o.shipment.status} />], ["Shipment", <span key="i" className="font-mono text-[12px]">{o.shipment.id}</span>], ["Carrier update", when(o.shipment.updatedAt)]]} /> : <Empty title="No shipment record" />}
            </Card>
          </div>

          <Card title="Financial summary" description="Order value, captured funds and refunds in INR">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                ["Order total", inr(o.amountMinor), ""],
                ["Captured", inr(captured), o.payment?.status === "failed" ? "text-bad" : ""],
                ["Refunded", inr(refundedOk), refundedOk ? "text-ok" : ""],
                ["Pending refunds", inr(refundedPending), refundedPending ? "text-warn" : ""],
                ["Refundable now", inr(o.eligibility.refund ? 0 : o.eligibility.refundableMinor), ""],
              ].map(([l, v, c]) => (
                <div key={l}><div className="text-[12px] text-fg-3">{l}</div><div className={clsx("num mt-1 text-[16px] font-semibold", c)}>{v}</div></div>
              ))}
            </div>
            {captured > 0 && (
              <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="bg-ok" style={{ width: `${(refundedOk / captured) * 100}%` }} />
                <div className="bg-warn" style={{ width: `${(refundedPending / captured) * 100}%` }} />
              </div>
            )}
          </Card>

          <Card title="Refunds" description={`${o.refunds.length} request${o.refunds.length === 1 ? "" : "s"}`} pad={false}
            actions={canRefund && !o.eligibility.refund && <Button size="sm" onClick={() => open("refund")} icon={<RotateCcw className="size-3.5" />}>New refund</Button>}>
            {o.refunds.length === 0 ? <Empty title="No refunds" hint="Refund requests and their approval outcome appear here." /> : (
              <Table head={[{ label: "Amount", align: "right" }, "Status", "Requested", "Approval", "Payment ref"]}>
                {o.refunds.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className={td + " num text-right font-semibold"}>{inr(r.amountMinor)}</td>
                    <td className={td}><Badge status={r.status} />{r.error && <div className="mt-1 max-w-64 text-[12px] text-bad">{r.error}</div>}</td>
                    <td className={td}><div>{r.requestedBy}</div><div className="text-[12px] text-fg-3">{r.source} · {when(r.createdAt)}</div>{r.reason && <div className="mt-0.5 max-w-52 truncate text-[12px] text-fg-2" title={r.reason}>“{r.reason}”</div>}</td>
                    <td className={td}>{r.approval ? <><Badge status={r.approval.status} />{r.approval.decidedBy && <div className="mt-0.5 text-[12px] text-fg-3">by {r.approval.decidedBy}</div>}</> : "—"}</td>
                    <td className={td + " font-mono text-[12px] text-fg-2"}>{r.externalId ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Support tickets" pad={false} actions={canTicket && <Button size="sm" onClick={() => open("ticket")} icon={<LifeBuoy className="size-3.5" />}>New ticket</Button>}>
            {o.tickets.length === 0 ? <Empty title="No tickets" hint="Tickets created manually or by workflows are listed here." /> : (
              <ul className="divide-y divide-line">
                {o.tickets.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <LifeBuoy className="mt-0.5 size-4 shrink-0 text-fg-3" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px]">{t.reason}</div>
                      <div className="mt-0.5 text-[12px] text-fg-3"><span className="font-mono">{t.externalId ?? "not created"}</span> · {t.createdBy} · {when(t.createdAt)}</div>
                      {t.error && <div className="mt-0.5 text-[12px] text-bad">{t.error}</div>}
                    </div>
                    <Badge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Timeline" pad={false} className="h-fit lg:sticky lg:top-[68px]"
          actions={<div className="flex rounded-ctl border border-line bg-subtle p-0.5 text-[12px]">{(["all", "audit"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={clsx("rounded-[5px] px-2 py-0.5 font-medium", tab === t ? "bg-surface text-fg shadow-card" : "text-fg-3")}>{t === "all" ? "Activity" : "Full audit"}</button>)}</div>}>
          {timeline.length === 0 ? <Empty title="No events yet" /> : (
            <ol className="max-h-[70vh] overflow-y-auto px-4 py-3">
              {timeline.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < timeline.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-16px)] w-px bg-line" aria-hidden />}
                  <span className={clsx("relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface", { ok: "text-ok", bad: "text-bad", warn: "text-warn", info: "text-info", violet: "text-violet", neutral: "text-fg-3", accent: "text-accent" }[e.tone])}>
                    {e.kind === "workflow" ? <Workflow className="size-3" /> : e.tone === "ok" ? <CheckCircle2 className="size-3" /> : e.tone === "bad" ? <XCircle className="size-3" /> : e.actor?.startsWith("workflow") || e.actor === "webhook" ? <Bot className="size-3" /> : e.tone === "neutral" ? <CircleSlash className="size-3" /> : <StatusDot tone={e.tone} />}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-[13px] font-medium leading-snug text-fg">{e.title}</div>
                    {e.detail && <div className="mt-0.5 break-words text-[12px] text-fg-2">{e.detail}</div>}
                    <div className="mt-0.5 text-[11px] text-fg-3">{e.actor ? `${e.actor} · ` : ""}{fullDate(e.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Modal open={modal === "cancel"} onClose={() => setModal(null)} title={`Cancel ${o.id}?`} description="The cancellation is sent to Commerce. The order is only marked cancelled here once Commerce confirms."
        footer={<><Button onClick={() => setModal(null)}>Keep order</Button><Button variant="danger" loading={busy} onClick={() => act(() => api(`/api/orders/${o.id}/cancel`, { json: { reason: reason || undefined } }), "Order cancelled", `${o.id} was cancelled in Commerce.`)}>Cancel order</Button></>}>
        {formError && <ErrorBox error={formError} />}
        <Field label="Reason" hint="Optional — recorded in the audit log."><input data-autofocus className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer requested cancellation" /></Field>
      </Modal>
      <Modal open={modal === "refund"} onClose={() => setModal(null)} title={`Request refund for ${o.id}`} description="Refunds need manager approval. Nothing is sent to the Payment service until a manager approves."
        footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!amountMinor || !!amountError} onClick={() => act(() => api(`/api/orders/${o.id}/refunds`, { json: { amount_minor: amountMinor, reason: reason || undefined } }), "Refund requested", "Sent to the approval queue for a manager.")}>Submit for approval</Button></>}>
        {formError && <ErrorBox error={formError} />}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-subtle p-3 text-[12px]">
          <div><div className="text-fg-3">Captured</div><div className="num font-medium">{inr(captured)}</div></div>
          <div><div className="text-fg-3">Already refunded</div><div className="num font-medium">{inr(refundedOk + refundedPending)}</div></div>
          <div><div className="text-fg-3">Refundable</div><div className="num font-medium">{inr(o.eligibility.refundableMinor)}</div></div>
        </div>
        <Field label="Amount (₹)" error={amountError} hint={amount && !amountMinor ? "Enter an amount like 1250 or 1250.50" : undefined}>
          <div className="flex gap-2">
            <input data-autofocus className={inputCls + " num"} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <Button size="md" onClick={() => setAmount(String(o.eligibility.refundableMinor / 100))}>Full</Button>
          </div>
        </Field>
        <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged on arrival" /></Field>
      </Modal>
      <Modal open={modal === "ticket"} onClose={() => setModal(null)} title={`Open support ticket for ${o.id}`} description="The ticket is created in Commerce and linked to this order."
        footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!reason.trim()} onClick={() => act(() => api(`/api/orders/${o.id}/tickets`, { json: { reason } }), "Ticket created", "The support ticket is open in Commerce.")}>Create ticket</Button></>}>
        {formError && <ErrorBox error={formError} />}
        <Field label="Reason"><textarea data-autofocus className={inputCls + " h-24 resize-none py-2"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the issue for the support team" /></Field>
      </Modal>
    </div>
  );
}

/** Human summary of audit details: amounts in ₹, upstream refs and errors; internal cuid ids are hidden. */
function describeDetails(d: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof d.amountMinor === "number") parts.push(inr(d.amountMinor));
  if (typeof d.status === "string") parts.push(titleCase(d.status));
  if (typeof d.externalId === "string") parts.push(d.externalId);
  if (typeof d.source === "string" && d.source !== "manual") parts.push(`via ${d.source}`);
  if (typeof d.newStatus === "string") parts.push(`now ${d.newStatus}`);
  if (typeof d.reason === "string" && d.reason) parts.push(`“${d.reason}”`);
  if (typeof d.note === "string" && d.note) parts.push(`note: “${d.note}”`);
  if (typeof d.detail === "string") parts.push(d.detail);
  if (typeof d.error === "string" && d.error) parts.push(d.error);
  return parts.join(" · ") || undefined;
}

function Eligibility({ ok, label, yes, no }: { ok: boolean; label: string; yes: string; no: string | null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3.5 py-2.5 shadow-card">
      <span className={clsx("grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-ok-soft text-ok" : "bg-neutral-soft text-fg-3")}>{ok ? <CheckCircle2 className="size-3.5" /> : <CircleSlash className="size-3.5" />}</span>
      <div className="min-w-0 text-[13px]"><span className="font-medium">{label}</span> <span className="text-fg-2">— {ok ? yes : no}</span></div>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={<SkeletonBlock className="h-64" />}><OrderDetail id={id} /></Suspense>;
}
