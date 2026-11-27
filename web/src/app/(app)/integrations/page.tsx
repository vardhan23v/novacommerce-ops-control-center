"use client";
import { useState } from "react";
import { RefreshCw, Webhook } from "lucide-react";
import { api, Badge, Button, Card, Empty, ErrorBox, fullDate, PageHeader, Skeleton, Table, td, useApi, useToast, when } from "@/components/ui";
import { useCan } from "@/components/session";

type H = { service: string; status: string; lastCallAt: string | null; lastSuccessAt: string | null; lastError: string | null; calls24h: number; failures24h: number };
type Call = { id: string; service: string; method: string; path: string; statusCode: number | null; ok: boolean; error: string | null; durationMs: number; attempt: number; createdAt: string };
type Run = { id: string; trigger: string; actor: string; status: string; results: { service: string; ok: boolean; count?: number; error?: string }[] | null; startedAt: string; finishedAt: string | null };
type Ev = { id: string; eventId: string; type: string; orderId: string | null; status: string; detail: string | null; receivedAt: string };

export default function Integrations() {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const info = useApi<{ probe: { reachable: boolean; error: string | null }; health: H[]; calls: Call[]; lastSuccessfulSync: Run | null }>(`/api/integrations${errorsOnly ? "?errors=1" : ""}`);
  const runs = useApi<Run[]>("/api/sync");
  const events = useApi<Ev[]>("/api/webhooks/events");
  const canSync = useCan("sync.run");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const r = await api<Run>("/api/sync", { method: "POST" });
      if (r.status === "succeeded") toast("success", "Sync completed for all services");
      else toast("error", `Sync ${r.status}: ${(r.results ?? []).filter((x) => !x.ok).map((x) => `${x.service} — ${x.error}`).join("; ")}`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
      info.reload();
      runs.reload();
    }
  }

  return (
    <>
      <PageHeader title="Integrations" subtitle={<>Commerce, Payment and Shipping services · last successful sync {when(info.data?.lastSuccessfulSync?.startedAt)}</>}
        actions={canSync && <Button variant="primary" loading={busy} onClick={sync}><RefreshCw className="size-3.5" />Sync now</Button>} />
      {info.data && !info.data.probe.reachable && <div className="mb-4"><ErrorBox error={`External services are unreachable right now (${info.data.probe.error}). The app keeps working on the last synced data; operations that need an external system will fail and be recorded.`} /></div>}
      <div className="grid gap-3 md:grid-cols-3">
        {info.loading && !info.data ? <Skeleton /> : info.data?.health.map((h) => (
          <Card key={h.service}>
            <div className="flex items-center justify-between"><h3 className="font-semibold capitalize">{h.service}</h3><Badge status={h.status} /></div>
            <dl className="mt-2 space-y-0.5 text-[12px]">
              <div className="flex justify-between"><dt className="text-ink-500">Last success</dt><dd>{when(h.lastSuccessAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Calls (24h)</dt><dd className="num">{h.calls24h}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Failures (24h)</dt><dd className={`num ${h.failures24h ? "text-rose-600" : ""}`}>{h.failures24h}</dd></div>
            </dl>
            {h.lastError && <p className="mt-2 text-[11px] text-rose-600">Last error: {h.lastError}</p>}
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Sync history" pad={false}>
          {runs.error ? <div className="p-3"><ErrorBox error={runs.error} /></div> : !runs.data ? <div className="p-4"><Skeleton /></div> : !runs.data.length ? <Empty title="No syncs yet" /> : (
            <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {runs.data.map((r) => (
                <li key={r.id} className="px-4 py-2">
                  <div className="flex items-center justify-between"><span>{fullDate(r.startedAt)} · <span className="text-ink-500">{r.trigger} by {r.actor}</span></span><Badge status={r.status} /></div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(r.results ?? []).map((x) => <span key={x.service} className={`rounded px-1.5 py-0.5 text-[11px] ${x.ok ? "bg-ink-100 text-ink-600" : "bg-rose-50 text-rose-700"}`}>{x.service}: {x.ok ? `${x.count} records` : x.error}</span>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><Webhook className="size-4" />Incoming webhook events</span>} pad={false} actions={<Button size="sm" variant="ghost" onClick={events.reload}>Refresh</Button>}>
          {events.error ? <div className="p-3"><ErrorBox error={events.error} /></div> : !events.data ? <div className="p-4"><Skeleton /></div> : !events.data.length ? <Empty title="No events received" hint="POST events to /api/webhooks — see README for curl examples." /> : (
            <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {events.data.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <div className="flex items-center justify-between"><span className="font-mono text-[12px]">{e.eventId} · {e.type} · {e.orderId}</span><Badge status={e.status} /></div>
                  <div className="text-[11px] text-ink-500">{e.detail} · {when(e.receivedAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Call log" className="mt-4" pad={false} actions={<label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />Errors only</label>}>
        {!info.data ? <div className="p-4"><Skeleton /></div> : !info.data.calls.length ? <Empty title="No calls recorded" /> : (
          <Table head={["When", "Service", "Request", "Status", "Duration", "Attempt", "Error"]}>
            {info.data.calls.map((c) => (
              <tr key={c.id}>
                <td className={td + " whitespace-nowrap text-ink-500"}>{when(c.createdAt)}</td>
                <td className={td + " capitalize"}>{c.service}</td>
                <td className={td + " font-mono text-[11px]"}>{c.method} {c.path}</td>
                <td className={td}><Badge tone={c.ok ? "green" : "red"}>{c.statusCode ?? "no response"}</Badge></td>
                <td className={td + " num text-ink-500"}>{c.durationMs}ms</td>
                <td className={td + " num text-ink-500"}>{c.attempt}</td>
                <td className={td + " text-[12px] text-rose-600"}>{c.error}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
