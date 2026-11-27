"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox, fullDate, inputCls, PageHeader, Skeleton, Table, td, useApi } from "@/components/ui";

type L = { id: string; actor: string; actorRole: string | null; action: string; entity: string; entityId: string | null; outcome: string; details: Record<string, unknown> | null; createdAt: string };

export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [outcome, setOutcome] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ items: L[]; page: number; pages: number; total: number }>(`/api/audit?q=${encodeURIComponent(applied)}&outcome=${outcome}&page=${page}`);
  return (
    <>
      <PageHeader title="Activity & audit" subtitle={data ? `${data.total} recorded events` : "Every consequential action, who did it and what happened"} />
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-ink-100 p-3">
          <form className="flex min-w-60 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q); setPage(1); }}>
            <input className={inputCls} placeholder="Search action, actor or order (e.g. refund, NC-1010, Maya)" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit">Search</Button>
          </form>
          <select aria-label="Outcome" className={inputCls + " w-auto"} value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }}>
            <option value="">All outcomes</option>{["success", "failure", "denied", "info"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={10} /></div> : !data?.items.length ? <Empty title="No matching activity" /> : (
          <>
            <Table head={["When", "Actor", "Action", "Entity", "Outcome", "Details"]}>
              {data.items.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className={td + " whitespace-nowrap text-ink-500"}>{fullDate(l.createdAt)}</td>
                  <td className={td}>{l.actor}{l.actorRole && <div className="text-[11px] capitalize text-ink-500">{l.actorRole}</div>}</td>
                  <td className={td + " font-mono text-[12px]"}>{l.action}</td>
                  <td className={td}>{l.entity === "order" && l.entityId ? <Link className="font-mono text-[12px] hover:underline" href={`/orders/${l.entityId}`}>{l.entityId}</Link> : <span className="text-[12px] text-ink-500">{l.entity}{l.entityId ? ` ${l.entityId.slice(0, 10)}` : ""}</span>}</td>
                  <td className={td}><Badge status={l.outcome} /></td>
                  <td className={td + " max-w-md"}><code className="block truncate text-[11px] text-ink-500" title={JSON.stringify(l.details)}>{l.details ? JSON.stringify(l.details) : ""}</code></td>
                </tr>
              ))}
            </Table>
            <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-[12px] text-ink-500">
              <span>Page {data.page} of {data.pages}</span>
              <div className="flex gap-1"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
