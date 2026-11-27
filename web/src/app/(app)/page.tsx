"use client";
import Link from "next/link";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, inr, PageHeader, Skeleton, useApi, when } from "@/components/ui";

type D = {
  totals: Record<string, number>;
  orderStatus: { status: string; count: number }[];
  paymentStatus: { status: string; count: number; amountMinor: number }[];
  shipmentStatus: { status: string; count: number }[];
  workflow: Record<string, number>;
  pendingApprovals: { id: string; createdAt: string; refund: { orderId: string; amountMinor: number; requestedBy: string } }[];
  recentExecutions: { id: string; status: string; detail: string; orderId: string; createdAt: string; workflow: { name: string } }[];
  recentActivity: { id: string; actor: string; action: string; entityId: string | null; outcome: string; createdAt: string }[];
  lastSync: { status: string; startedAt: string } | null;
  health: { service: string; status: string; lastSuccessAt: string | null; failures24h: number; lastError: string | null }[];
  attention: { id: string; amountMinor: number; customer: { name: string }; payment: { status: string } | null; shipment: { status: string; lastSyncError: string | null } | null }[];
};

const COLORS: Record<string, string> = { processing: "#0ea5e9", shipped: "#8b5cf6", delivered: "#10b981", cancelled: "#94a3b8", captured: "#10b981", failed: "#f43f5e", pending: "#94a3b8", delayed: "#f59e0b" };

function Kpi({ label, value, sub, href, tone }: { label: string; value: string | number; sub?: string; href?: string; tone?: "red" | "amber" }) {
  const body = (
    <div className="group rounded-lg border border-ink-200 bg-white px-3.5 py-3 transition hover:border-ink-300">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-500">
        {label}
        {href && <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />}
      </div>
      <div className={`num mt-1 text-[22px] font-semibold tracking-tight ${tone === "red" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-ink-900"}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Overview() {
  const { data, error, loading, reload } = useApi<D>("/api/dashboard");
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton rows={8} />;
  if (!data) return null;
  const t = data.totals;
  const wfTotal = Object.values(data.workflow).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Operations overview"
        subtitle={<>Live from the local projection · last sync {data.lastSync ? <>{when(data.lastSync.startedAt)} <Badge status={data.lastSync.status} /></> : "never"}</>}
      />
      {t.orders === 0 && (
        <div className="mb-4">
          <ErrorBox error="No orders imported yet. Open Integrations and run a sync (the mock service must be running)." />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Orders" value={t.orders} sub={inr(t.grossMinor) + " gross"} href="/orders" />
        <Kpi label="Processing" value={t.processing} href="/orders?status=processing" />
        <Kpi label="Shipped" value={t.shipped} href="/orders?status=shipped" />
        <Kpi label="Delivered" value={t.delivered} href="/orders?status=delivered" />
        <Kpi label="Failed payments" value={t.failedPayments} tone={t.failedPayments ? "red" : undefined} href="/payments?status=failed" />
        <Kpi label="Delayed shipments" value={t.delayedShipments} tone={t.delayedShipments ? "amber" : undefined} href="/shipments?status=delayed" />
        <Kpi label="Pending approvals" value={t.pendingApprovals} tone={t.pendingApprovals ? "amber" : undefined} href="/approvals" />
        <Kpi label="Open tickets" value={t.openTickets} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Refunds succeeded" value={t.succeededRefunds} sub={inr(t.succeededRefundMinor)} />
        <Kpi label="Refunds failed" value={t.failedRefunds} tone={t.failedRefunds ? "red" : undefined} />
        <Kpi label="Failed API calls (24h)" value={t.failedExternalOps} tone={t.failedExternalOps ? "red" : undefined} href="/integrations" />
        <Kpi label="Workflow runs" value={wfTotal} sub={`${data.workflow.succeeded ?? 0} ok · ${data.workflow.failed ?? 0} failed · ${data.workflow.skipped ?? 0} skipped`} href="/workflows" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Order status">
          {data.orderStatus.length === 0 ? <Empty title="No orders" /> : (
            <div className="flex items-center gap-4">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.orderStatus} dataKey="count" nameKey="status" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
                      {data.orderStatus.map((s) => <Cell key={s.status} fill={COLORS[s.status] ?? "#cbd5e1"} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5">
                {data.orderStatus.map((s) => (
                  <li key={s.status} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 capitalize"><span className="size-2 rounded-sm" style={{ background: COLORS[s.status] }} />{s.status}</span>
                    <span className="num font-medium">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Payment health">
          <div className="space-y-3">
            {data.paymentStatus.map((p) => {
              const total = data.paymentStatus.reduce((a, b) => a + b.count, 0) || 1;
              return (
                <div key={p.status}>
                  <div className="mb-1 flex justify-between text-[12px]"><span className="capitalize">{p.status}</span><span className="num text-ink-500">{p.count} · {inr(p.amountMinor)}</span></div>
                  <div className="h-2 rounded-full bg-ink-100"><div className="h-2 rounded-full" style={{ width: `${(p.count / total) * 100}%`, background: COLORS[p.status] ?? "#94a3b8" }} /></div>
                </div>
              );
            })}
            {data.paymentStatus.length === 0 && <Empty title="No payments imported" />}
          </div>
        </Card>
        <Card title="Shipment status">
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={data.shipmentStatus} margin={{ left: -20 }}>
                <XAxis dataKey="status" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {data.shipmentStatus.map((s) => <Cell key={s.status} fill={COLORS[s.status] ?? "#94a3b8"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Needs attention" actions={<span className="text-[11px] text-ink-500">failed payment · delayed · lookup errors</span>} pad={false}>
          {data.attention.length === 0 ? <Empty title="Nothing needs attention" /> : (
            <ul className="divide-y divide-ink-100">
              {data.attention.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-ink-50">
                    <div>
                      <div className="font-mono text-[12px] font-medium">{o.id}</div>
                      <div className="text-[11px] text-ink-500">{o.customer.name} · {inr(o.amountMinor)}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {o.payment?.status === "failed" && <Badge status="failed">payment failed</Badge>}
                      {o.shipment?.status === "delayed" && <Badge status="delayed" />}
                      {o.shipment?.lastSyncError && <Badge tone="red">lookup error</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Pending approvals" actions={<Link href="/approvals" className="text-[12px] text-accent-700 hover:underline">Open queue</Link>} pad={false}>
          {data.pendingApprovals.length === 0 ? <Empty title="Queue is clear" /> : (
            <ul className="divide-y divide-ink-100">
              {data.pendingApprovals.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <Link href={`/orders/${a.refund.orderId}`} className="font-mono text-[12px] font-medium hover:underline">{a.refund.orderId}</Link>
                    <div className="text-[11px] text-ink-500">by {a.refund.requestedBy} · {when(a.createdAt)}</div>
                  </div>
                  <span className="num font-medium">{inr(a.refund.amountMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Integration health" actions={<Link href="/integrations" className="text-[12px] text-accent-700 hover:underline">Details</Link>}>
          <ul className="space-y-2.5">
            {data.health.map((h) => (
              <li key={h.service} className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium capitalize">{h.service}</div>
                  <div className="text-[11px] text-ink-500">last ok {when(h.lastSuccessAt)} · {h.failures24h} failures 24h</div>
                  {h.lastError && <div className="flex items-center gap-1 text-[11px] text-rose-600"><AlertTriangle className="size-3" />{h.lastError}</div>}
                </div>
                <Badge status={h.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Recent workflow executions" pad={false}>
          {data.recentExecutions.length === 0 ? <Empty title="No workflow runs yet" hint="Workflows run when webhooks arrive or orders are cancelled." /> : (
            <ul className="divide-y divide-ink-100">
              {data.recentExecutions.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.workflow.name}</div>
                    <div className="truncate text-[11px] text-ink-500"><span className="font-mono">{e.orderId}</span> · {e.detail}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5"><Badge status={e.status} /><span className="text-[10px] text-ink-400">{when(e.createdAt)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity" actions={<Link href="/activity" className="text-[12px] text-accent-700 hover:underline">All activity</Link>} pad={false}>
          {data.recentActivity.length === 0 ? <Empty title="No activity yet" /> : (
            <ul className="divide-y divide-ink-100">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="min-w-0 truncate"><span className="font-medium">{a.actor}</span> <span className="text-ink-500">{a.action}</span> {a.entityId && <span className="font-mono text-[12px]">{a.entityId}</span>}</div>
                  <div className="flex shrink-0 items-center gap-2"><Badge status={a.outcome} /><span className="text-[10px] text-ink-400">{when(a.createdAt)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
