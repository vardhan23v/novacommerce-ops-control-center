"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, Clock, CreditCard, PackageCheck, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { Badge, Card, ChartTooltip, Empty, ErrorBox, inr, inrCompact, Kpi, OrderLink, PageHeader, SkeletonBlock, StatusDot, titleCase, toneOf, useApi, when, Button, clsx } from "@/components/ui";
import { useChartColors } from "@/components/charts";

type D = {
  totals: Record<string, number>;
  orderStatus: { status: string; count: number }[];
  paymentStatus: { status: string; count: number; amountMinor: number }[];
  shipmentStatus: { status: string; count: number }[];
  refundStatus: { status: string; count: number; amountMinor: number }[];
  workflow: Record<string, number>;
  pendingApprovals: { id: string; createdAt: string; refund: { orderId: string; amountMinor: number; requestedBy: string; source: string } }[];
  recentExecutions: { id: string; status: string; detail: string; orderId: string; createdAt: string; workflow: { name: string } }[];
  recentActivity: { id: string; actor: string; action: string; entityId: string | null; outcome: string; createdAt: string }[];
  lastSync: { status: string; startedAt: string } | null;
  lastFailedSync: { status: string; startedAt: string } | null;
  health: { service: string; status: string; lastSuccessAt: string | null; failures24h: number; calls24h: number; lastError: string | null }[];
  attention: { id: string; amountMinor: number; customer: { name: string }; payment: { status: string } | null; shipment: { status: string; lastSyncError: string | null } | null }[];
};

const ORDER_ORDER = ["processing", "shipped", "delivered", "cancelled"];
const SHIP_ORDER = ["pending", "shipped", "delayed", "delivered", "cancelled"];

export default function Overview() {
  const { data, error, loading, reload } = useApi<D>("/api/dashboard");
  const col = useChartColors();

  if (error) return <ErrorBox title="Couldn't load the dashboard" error={error} onRetry={reload} />;
  if (loading && !data)
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-[98px]" />)}</div>
        <div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-72" />)}</div>
      </div>
    );
  if (!data) return null;
  const t = data.totals;
  const orderStatus = [...data.orderStatus].sort((a, b) => ORDER_ORDER.indexOf(a.status) - ORDER_ORDER.indexOf(b.status));
  const shipStatus = [...data.shipmentStatus].sort((a, b) => SHIP_ORDER.indexOf(a.status) - SHIP_ORDER.indexOf(b.status));
  const payTotal = data.paymentStatus.reduce((a, b) => a + b.count, 0) || 1;
  const captured = data.paymentStatus.find((p) => p.status === "captured");
  const failed = data.paymentStatus.find((p) => p.status === "failed");
  const wf = { ok: data.workflow.succeeded ?? 0, failed: data.workflow.failed ?? 0, skipped: data.workflow.skipped ?? 0 };
  const wfTotal = wf.ok + wf.failed + wf.skipped;
  const degraded = data.health.filter((h) => h.status !== "healthy");

  return (
    <div className="anim-in">
      <PageHeader
        title="Operations overview"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            Live from synchronized Commerce, Payment and Shipping data
            <span className="hidden text-fg-3 sm:inline">·</span>
            <span className="inline-flex items-center gap-1.5 text-fg-3">
              <StatusDot tone={data.lastSync?.status === "succeeded" ? "ok" : "warn"} />last sync {when(data.lastSync?.startedAt)}
            </span>
          </span>
        }
        actions={<><Button icon={<RefreshCw className="size-3.5" />} onClick={reload} loading={loading}>Refresh</Button><Link href="/orders"><Button variant="primary">View orders</Button></Link></>}
      />

      {t.orders === 0 && <div className="mb-4"><ErrorBox title="No data imported yet" error="Open Integrations and run a sync. The external services must be reachable." /></div>}
      {degraded.length > 0 && (
        <Link href="/integrations" className="mb-4 flex items-center gap-2.5 rounded-card border border-warn/25 bg-warn-soft px-3.5 py-2 text-[13px] transition-colors hover:border-warn/40">
          <AlertTriangle className="size-4 text-warn" />
          <span className="flex-1"><span className="font-medium">{degraded.map((d) => titleCase(d.service)).join(", ")}</span> {degraded.length === 1 ? "is" : "are"} degraded — last error: {degraded[0].lastError}</span>
          <ArrowRight className="size-3.5 text-fg-3" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total orders" value={t.orders} context={`${inrCompact(t.grossMinor)} gross order value`} icon={<Boxes className="size-3.5" />} href="/orders" />
        <Kpi label="Processing" value={t.processing} context="Awaiting shipment" icon={<Clock className="size-3.5" />} href="/orders?status=processing" />
        <Kpi label="Delivered" value={t.delivered} context={`${t.shipped} shipped · ${t.cancelled} cancelled`} icon={<PackageCheck className="size-3.5" />} href="/orders?status=delivered" />
        <Kpi label="Failed payments" value={t.failedPayments} tone={t.failedPayments ? "bad" : undefined} context={`${inrCompact(failed?.amountMinor ?? 0)} uncollected`} icon={<CreditCard className="size-3.5" />} href="/payments?status=failed" />
        <Kpi label="Delayed shipments" value={t.delayedShipments} tone={t.delayedShipments ? "warn" : undefined} context="Carrier reported delay" icon={<Truck className="size-3.5" />} href="/shipments?status=delayed" />
        <Kpi label="Pending approvals" value={t.pendingApprovals} tone={t.pendingApprovals ? "warn" : undefined} context="Refunds awaiting a manager" icon={<ShieldCheck className="size-3.5" />} href="/approvals" />
      </div>

      <div className="mt-3 grid grid-cols-2 divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card md:grid-cols-4 md:divide-x">
        {[
          { l: "Refunds succeeded", v: t.succeededRefunds, c: inr(t.succeededRefundMinor) },
          { l: "Refunds failed", v: t.failedRefunds, c: "Recorded from Payment API", tone: t.failedRefunds ? "text-bad" : "" },
          { l: "Failed API calls · 24h", v: t.failedExternalOps, c: "Across all three services", tone: t.failedExternalOps ? "text-bad" : "", href: "/integrations" },
          { l: "Workflow runs", v: wfTotal, c: `${wf.ok} succeeded · ${wf.failed} failed · ${wf.skipped} skipped`, href: "/workflows" },
        ].map((s) => {
          const body = (
            <div className="px-4 py-3">
              <div className="text-[12px] text-fg-3">{s.l}</div>
              <div className="mt-0.5 flex items-baseline gap-2"><span className={clsx("num text-[17px] font-semibold", s.tone)}>{s.v}</span><span className="truncate text-[12px] text-fg-3">{s.c}</span></div>
            </div>
          );
          return s.href ? <Link key={s.l} href={s.href} className="border-b border-line transition-colors hover:bg-subtle/50 md:border-b-0">{body}</Link> : <div key={s.l} className="border-b border-line md:border-b-0">{body}</div>;
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Order status" description={`${t.orders} orders by fulfilment stage`}>
          {orderStatus.length === 0 ? <Empty title="No orders yet" /> : (
            <div className="flex items-center gap-5">
              <div className="relative size-[150px] shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={orderStatus} dataKey="count" nameKey="status" innerRadius={50} outerRadius={72} paddingAngle={2} cornerRadius={3} stroke="none" isAnimationActive={false}>
                      {orderStatus.map((s) => <Cell key={s.status} fill={col.status(s.status)} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div><div className="num text-[20px] font-semibold leading-none">{t.orders}</div><div className="mt-1 text-[11px] text-fg-3">orders</div></div>
                </div>
              </div>
              <ul className="flex-1 space-y-2">
                {orderStatus.map((s) => (
                  <li key={s.status}>
                    <Link href={`/orders?status=${s.status}`} className="flex items-center gap-2 rounded px-1 py-0.5 text-[13px] hover:bg-subtle">
                      <span className="size-2.5 rounded-sm" style={{ background: col.status(s.status) }} />
                      <span className="flex-1 capitalize text-fg-2">{s.status}</span>
                      <span className="num font-medium">{s.count}</span>
                      <span className="num w-10 text-right text-[12px] text-fg-3">{Math.round((s.count / (t.orders || 1)) * 100)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Payment health" description="Captured vs failed transactions">
          <div className="flex items-end justify-between">
            <div><div className="num text-[24px] font-semibold leading-none">{Math.round(((captured?.count ?? 0) / payTotal) * 100)}%</div><div className="mt-1 text-[12px] text-fg-3">capture rate</div></div>
            <Link href="/payments?status=failed" className="text-[12px] font-medium text-accent hover:underline">Review failures</Link>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
            {data.paymentStatus.map((p) => <div key={p.status} style={{ width: `${(p.count / payTotal) * 100}%`, background: col.status(p.status) }} title={`${p.status}: ${p.count}`} />)}
          </div>
          <div className="mt-4 space-y-2.5">
            {data.paymentStatus.map((p) => (
              <div key={p.status} className="flex items-center gap-2 text-[13px]">
                <span className="size-2.5 rounded-sm" style={{ background: col.status(p.status) }} />
                <span className="flex-1 capitalize text-fg-2">{p.status}</span>
                <span className="num font-medium">{p.count}</span>
                <span className="num w-24 text-right text-[12px] text-fg-3">{inr(p.amountMinor)}</span>
              </div>
            ))}
          </div>
          {data.refundStatus.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-fg-3">Refunds</div>
              <div className="flex flex-wrap gap-1.5">{data.refundStatus.map((r) => <Badge key={r.status} status={r.status}>{titleCase(r.status)} · {r.count}</Badge>)}</div>
            </div>
          )}
        </Card>

        <Card title="Shipping performance" description="Shipments by carrier status">
          <div className="h-[200px]">
            <ResponsiveContainer>
              <BarChart data={shipStatus} margin={{ left: -24, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke={col.grid} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: col.axis }} axisLine={false} tickLine={false} tickFormatter={titleCase} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: col.axis }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: col.cursor }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="shipments" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                  {shipStatus.map((s) => <Cell key={s.status} fill={col.status(s.status)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Needs attention" description="Failed payments, delays and lookup errors" pad={false} className="xl:col-span-2"
          actions={<Link href="/assistant" className="text-[12px] font-medium text-accent hover:underline">Ask Nova</Link>}>
          {data.attention.length === 0 ? <Empty title="Nothing needs attention" icon={<CheckCircle2 className="size-5" />} /> : (
            <ul className="divide-y divide-line">
              {data.attention.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-subtle/60">
                    <div className="w-20 shrink-0"><span className="font-mono text-[12px] font-medium">{o.id}</span></div>
                    <div className="min-w-0 flex-1 truncate text-fg-2">{o.customer.name}</div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {o.payment?.status === "failed" && <Badge tone="bad">Payment failed</Badge>}
                      {o.shipment?.status === "delayed" && <Badge tone="warn">Delayed</Badge>}
                      {o.shipment?.lastSyncError && <Badge tone="bad" dot={false}>Lookup error</Badge>}
                    </div>
                    <div className="num w-24 shrink-0 text-right font-medium">{inr(o.amountMinor)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Pending approvals" pad={false} actions={<Link href="/approvals" className="text-[12px] font-medium text-accent hover:underline">Open queue</Link>}>
          {data.pendingApprovals.length === 0 ? <Empty title="Queue is clear" hint="No refunds are waiting for a manager." icon={<ShieldCheck className="size-5" />} /> : (
            <ul className="divide-y divide-line">
              {data.pendingApprovals.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <OrderLink id={a.refund.orderId} />
                    <div className="truncate text-[12px] text-fg-3">{a.refund.requestedBy} · {when(a.createdAt)}</div>
                  </div>
                  <span className="num font-semibold">{inr(a.refund.amountMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Integration health" actions={<Link href="/integrations" className="text-[12px] font-medium text-accent hover:underline">Details</Link>}>
          <ul className="space-y-3">
            {data.health.map((h) => (
              <li key={h.service} className="flex items-start gap-3">
                <div className="mt-1"><StatusDot tone={toneOf(h.status)} pulse={h.status === "degraded"} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between"><span className="font-medium capitalize">{h.service} API</span><Badge status={h.status} dot={false} /></div>
                  <div className="text-[12px] text-fg-3">Last success {when(h.lastSuccessAt)} · {h.failures24h}/{h.calls24h} failed (24h)</div>
                  {h.lastError && <div className="mt-0.5 truncate text-[12px] text-bad">{h.lastError}</div>}
                </div>
              </li>
            ))}
          </ul>
          {data.lastFailedSync && <div className="mt-3 border-t border-line pt-2.5 text-[12px] text-fg-3">Last failed/partial sync {when(data.lastFailedSync.startedAt)}</div>}
        </Card>

        <Card title="Workflow executions" pad={false} actions={<Link href="/workflows" className="text-[12px] font-medium text-accent hover:underline">All runs</Link>}>
          {data.recentExecutions.length === 0 ? <Empty title="No workflow runs yet" hint="Workflows run when webhooks arrive or orders are cancelled." /> : (
            <ul className="divide-y divide-line">
              {data.recentExecutions.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="mt-1.5"><StatusDot tone={toneOf(e.status)} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{e.workflow.name}</div>
                    <div className="truncate text-[12px] text-fg-3"><span className="font-mono">{e.orderId}</span> · {e.detail}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-fg-3">{when(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" pad={false} actions={<Link href="/activity" className="text-[12px] font-medium text-accent hover:underline">Audit log</Link>}>
          {data.recentActivity.length === 0 ? <Empty title="No activity yet" /> : (
            <ul className="divide-y divide-line">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="mt-1.5"><StatusDot tone={toneOf(a.outcome)} /></div>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="truncate"><span className="font-medium">{a.actor}</span> <span className="text-fg-2">{a.action}</span></div>
                    {a.entityId && <div className="truncate font-mono text-[11px] text-fg-3">{a.entityId}</div>}
                  </div>
                  <span className="shrink-0 text-[11px] text-fg-3">{when(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
