"use client";
import { useState } from "react";
import { CreditCard, RefreshCw, ShoppingBag, Truck, Webhook } from "lucide-react";
import { api, Badge, Button, Callout, Card, clsx, Empty, ErrorBox, fullDate, OrderLink, PageHeader, Segmented, SkeletonBlock, StatusDot, Table, td, toneOf, tr, useApi, useToast, when } from "@/components/ui";
import { useCan } from "@/components/session";

type H = { service: string; status: string; lastCallAt: string | null; lastSuccessAt: string | null; lastError: string | null; calls24h: number; failures24h: number };
type Call = { id: string; service: string; method: string; path: string; statusCode: number | null; ok: boolean; error: string | null; durationMs: number; attempt: number; createdAt: string };
type Run = { id: string; trigger: string; actor: string; status: string; results: { service: string; ok: boolean; count?: number; error?: string }[] | null; startedAt: string; finishedAt: string | null };
type Ev = { id: string; eventId: string; type: string; orderId: string | null; status: string; detail: string | null; receivedAt: string };
type Info = { probe: { reachable: boolean; error: string | null }; health: H[]; calls: Call[]; lastSuccessfulSync: Run | null; lastFailedSync: Run | null };

const SERVICES: Record<string, { name: string; icon: typeof Truck; desc: string }> = {
  commerce: { name: "Commerce API", icon: ShoppingBag, desc: "Customers, orders, cancellations, support tickets" },
  payments: { name: "Payment API", icon: CreditCard, desc: "Transactions and refunds" },
  shipping: { name: "Shipping API", icon: Truck, desc: "Shipment status from carriers" },
};

export default function Integrations() {
  const [errorsOnly, setErrorsOnly] = useState<"all" | "errors">("all");
  const [svc, setSvc] = useState<string>("");
  const info = useApi<Info>(`/api/integrations?${new URLSearchParams({ ...(errorsOnly === "errors" ? { errors: "1" } : {}), ...(svc ? { service: svc } : {}) })}`);
  const runs = useApi<Run[]>("/api/sync");
  const events = useApi<Ev[]>("/api/webhooks/events");
  const canSync = useCan("sync.run");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const r = await api<Run>("/api/sync", { method: "POST" });
      if (r.status === "succeeded") toast("success", (r.results ?? []).map((x) => `${x.service}: ${x.count}`).join(" · "), "Sync completed");
      else toast("error", (r.results ?? []).filter((x) => !x.ok).map((x) => `${x.service} — ${x.error}`).join("; "), `Sync ${r.status}`);
    } catch (e) {
      toast("error", (e as Error).message, "Sync failed");
    } finally {
      setBusy(false);
      info.reload();
      runs.reload();
    }
  }

  return (
    <div className="anim-in">
      <PageHeader title="Integrations" description="Connection health, synchronization and incoming events for NovaCommerce's external systems."
        actions={canSync && <Button variant="primary" loading={busy} onClick={sync} icon={<RefreshCw className="size-3.5" />}>Sync now</Button>} />

      {info.data && !info.data.probe.reachable && (
        <div className="mb-4"><Callout tone="bad"><span className="font-medium">External services are unreachable</span> ({info.data.probe.error}). The app keeps working from the last synced data; operations that need an external system will fail and be recorded.</Callout></div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {!info.data ? [0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-44" />) : info.data.health.map((h) => {
          const S = SERVICES[h.service];
          const rate = h.calls24h ? Math.round(((h.calls24h - h.failures24h) / h.calls24h) * 100) : null;
          return (
            <div key={h.service} className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-lg border border-line bg-subtle"><S.icon className="size-4 text-fg-2" /></span>
                  <div><div className="text-[14px] font-semibold">{S.name}</div><div className="text-[12px] text-fg-3">{S.desc}</div></div>
                </div>
                <span className="flex items-center gap-1.5 text-[12px] font-medium capitalize"><StatusDot tone={toneOf(h.status)} pulse={h.status === "degraded"} />{h.status}</span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
                <div><dt className="text-fg-3">Success rate</dt><dd className="num mt-0.5 text-[15px] font-semibold">{rate === null ? "—" : `${rate}%`}</dd></div>
                <div><dt className="text-fg-3">Calls · 24h</dt><dd className="num mt-0.5 text-[15px] font-semibold">{h.calls24h}</dd></div>
                <div><dt className="text-fg-3">Failures</dt><dd className={clsx("num mt-0.5 text-[15px] font-semibold", h.failures24h && "text-bad")}>{h.failures24h}</dd></div>
              </dl>
              <div className="mt-3 space-y-1 text-[12px]">
                <div className="flex justify-between"><span className="text-fg-3">Last success</span><span>{when(h.lastSuccessAt)}</span></div>
                <div className="flex justify-between"><span className="text-fg-3">Last call</span><span>{when(h.lastCallAt)}</span></div>
              </div>
              {h.lastError && <div className="mt-3 truncate rounded-md bg-bad-soft px-2.5 py-1.5 text-[12px] text-bad" title={h.lastError}>{h.lastError}</div>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
          <StatusDot tone="ok" /><div className="text-[13px]"><span className="text-fg-3">Last successful sync</span> <span className="font-medium">{info.data?.lastSuccessfulSync ? `${when(info.data.lastSuccessfulSync.startedAt)} · ${info.data.lastSuccessfulSync.trigger} by ${info.data.lastSuccessfulSync.actor}` : "never"}</span></div>
        </div>
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
          <StatusDot tone={info.data?.lastFailedSync ? "bad" : "neutral"} /><div className="min-w-0 truncate text-[13px]"><span className="text-fg-3">Last failed sync</span> <span className="font-medium">{info.data?.lastFailedSync ? `${when(info.data.lastFailedSync.startedAt)} · ${(info.data.lastFailedSync.results ?? []).filter((r) => !r.ok).map((r) => `${r.service}: ${r.error}`).join("; ")}` : "none recorded"}</span></div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Sync history" description="Each run upserts; a failing service never deletes local data" pad={false}>
          {runs.error ? <div className="p-4"><ErrorBox error={runs.error} /></div> : !runs.data ? <div className="p-4"><SkeletonBlock className="h-40" /></div> : !runs.data.length ? <Empty title="No syncs yet" /> : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {runs.data.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px]"><span className="font-medium">{fullDate(r.startedAt)}</span> <span className="text-fg-3">· {r.trigger} by {r.actor}</span></span>
                    <Badge status={r.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(r.results ?? []).map((x) => (
                      <span key={x.service} className={clsx("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]", x.ok ? "border-line text-fg-2" : "border-bad/25 bg-bad-soft text-bad")}>
                        <span className="font-medium capitalize">{x.service}</span>{x.ok ? <span className="num">{x.count} records</span> : <span className="max-w-56 truncate">{x.error}</span>}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Webhook className="size-3.5 text-fg-3" />Incoming webhook events</span>} description="POST /api/webhooks · deduplicated by event_id" pad={false} actions={<Button size="sm" variant="ghost" onClick={events.reload} icon={<RefreshCw className="size-3.5" />} aria-label="Refresh events" />}>
          {events.error ? <div className="p-4"><ErrorBox error={events.error} /></div> : !events.data ? <div className="p-4"><SkeletonBlock className="h-40" /></div> : !events.data.length ? <Empty title="No events received" hint="Upstream systems POST events to /api/webhooks. See the README for curl examples." /> : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {events.data.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="mt-1.5"><StatusDot tone={toneOf(e.status)} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-medium">{e.type}</span>{e.orderId && <OrderLink id={e.orderId} />}<span className="font-mono text-[11px] text-fg-3">{e.eventId}</span></div>
                    <div className="truncate text-[12px] text-fg-3">{e.detail} · {when(e.receivedAt)}</div>
                  </div>
                  <Badge status={e.status} dot={false} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4" title="API call log" description="Every request to an external service, with status, latency and retries" pad={false}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={svc || "all"} onChange={(v) => setSvc(v === "all" ? "" : v)} options={[{ value: "all", label: "All" }, { value: "commerce", label: "Commerce" }, { value: "payments", label: "Payments" }, { value: "shipping", label: "Shipping" }]} />
            <Segmented size="sm" value={errorsOnly} onChange={setErrorsOnly} options={[{ value: "all", label: "All calls" }, { value: "errors", label: "Errors" }]} />
          </div>
        }>
        {!info.data ? <div className="p-4"><SkeletonBlock className="h-40" /></div> : !info.data.calls.length ? <Empty title="No calls recorded" /> : (
          <Table head={["When", "Service", "Request", "Status", { label: "Latency", align: "right" }, { label: "Attempt", align: "right" }, "Error"]}>
            {info.data.calls.map((c) => (
              <tr key={c.id} className={tr}>
                <td className={td + " whitespace-nowrap text-fg-2"}>{when(c.createdAt)}</td>
                <td className={td + " capitalize"}>{c.service}</td>
                <td className={td + " font-mono text-[12px]"}><span className={clsx("mr-1.5 rounded px-1 text-[10px] font-semibold", c.method === "POST" ? "bg-violet-soft text-violet" : "bg-info-soft text-info")}>{c.method}</span>{c.path}</td>
                <td className={td}><Badge tone={c.ok ? "ok" : "bad"}>{c.statusCode ?? "no response"}</Badge></td>
                <td className={td + " num text-right text-fg-2"}>{c.durationMs} ms</td>
                <td className={td + " num text-right text-fg-2"}>{c.attempt}</td>
                <td className={td + " max-w-64 truncate text-[12px] text-bad"} title={c.error ?? ""}>{c.error}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
