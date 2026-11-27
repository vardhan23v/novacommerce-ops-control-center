"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { actionLabel, Badge, Button, Card, clsx, Empty, ErrorBox, inputCls, PageHeader, Pagination, Segmented, Skeleton, StatusDot, toneOf, useApi } from "@/components/ui";

type L = { id: string; actor: string; actorRole: string | null; action: string; entity: string; entityId: string | null; outcome: string; details: Record<string, unknown> | null; createdAt: string };

const QUICK = [
  { label: "Refunds", q: "refund" },
  { label: "Cancellations", q: "order.cancel" },
  { label: "Workflows", q: "workflow" },
  { label: "Webhooks", q: "webhook" },
  { label: "Sync", q: "integration" },
  { label: "Denied", q: "denied" },
];

export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [outcome, setOutcome] = useState<"" | "success" | "failure" | "denied" | "info">("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<{ items: L[]; page: number; pages: number; total: number }>(`/api/audit?q=${encodeURIComponent(applied)}&outcome=${outcome}&page=${page}`);

  const groups = useMemo(() => {
    const m = new Map<string, L[]>();
    for (const l of data?.items ?? []) {
      const d = new Date(l.createdAt);
      const today = new Date();
      const key = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === new Date(Date.now() - 864e5).toDateString() ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      m.set(key, [...(m.get(key) ?? []), l]);
    }
    return [...m.entries()];
  }, [data]);

  const apply = (v: string) => { setQ(v); setApplied(v); setPage(1); };

  return (
    <div className="anim-in">
      <PageHeader title="Activity" description={data ? <><span className="num">{data.total.toLocaleString("en-IN")}</span> audited events — who did what, to which record, and what happened</> : "Audit trail of every consequential action"} />
      <Card pad={false}>
        <div className="space-y-2.5 border-b border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <form className="relative min-w-60 flex-1" onSubmit={(e) => { e.preventDefault(); apply(q.trim()); }}>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
              <input className={inputCls + " pl-8"} placeholder="Search by action, actor or record — e.g. refund, NC-1010, Maya" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activity" />
            </form>
            <Segmented value={outcome} onChange={(v) => { setOutcome(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "success", label: "Success" }, { value: "failure", label: "Failure" }, { value: "denied", label: "Denied" }, { value: "info", label: "Info" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK.map((f) => (
              <button key={f.q} onClick={() => apply(applied === f.q ? "" : f.q)} className={clsx("h-6 rounded-full border px-2.5 text-[12px] transition-colors", applied === f.q ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:border-line-strong hover:text-fg")}>{f.label}</button>
            ))}
            {(applied || outcome) && <button onClick={() => { apply(""); setOutcome(""); }} className="ml-1 text-[12px] font-medium text-accent hover:underline">Reset</button>}
          </div>
        </div>
        {error ? <div className="p-4"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={10} /></div> : !data?.items.length ? <Empty title="No matching activity" hint="Try a broader search or reset the filters." action={<Button onClick={() => { apply(""); setOutcome(""); }}>Reset filters</Button>} /> : (
          <div className={clsx(loading && "opacity-60")}>
            {groups.map(([day, items]) => (
              <section key={day}>
                <h3 className="sticky top-[52px] z-10 border-b border-line bg-subtle/90 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3 backdrop-blur">{day}</h3>
                <ul className="divide-y divide-line">
                  {items.map((l) => {
                    const expanded = open === l.id;
                    return (
                      <li key={l.id}>
                        <button onClick={() => setOpen(expanded ? null : l.id)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-subtle/60">
                          <span className="w-14 shrink-0 font-mono text-[11px] text-fg-3">{new Date(l.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          <StatusDot tone={toneOf(l.outcome)} />
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            <span className="font-medium">{l.actor}</span>
                            {l.actorRole && <span className="ml-1 text-[11px] capitalize text-fg-3">({l.actorRole})</span>}
                            <span className="text-fg-2"> · {actionLabel(l.action)}</span>
                            {l.entityId && <span className="ml-1.5 font-mono text-[12px] text-fg-2">{l.entityId.startsWith("NC-") ? l.entityId : `${l.entity} ${l.entityId.slice(0, 8)}`}</span>}
                          </span>
                          <Badge status={l.outcome} dot={false} />
                          <ChevronDown className={clsx("size-3.5 shrink-0 text-fg-3 transition-transform", expanded && "rotate-180")} />
                        </button>
                        {expanded && (
                          <div className="anim-in border-t border-line bg-subtle/40 px-4 py-3 pl-[88px]">
                            <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-[120px_1fr]">
                              <dt className="text-fg-3">Action</dt><dd className="font-mono">{l.action}</dd>
                              <dt className="text-fg-3">Entity</dt><dd>{l.entity}{l.entityId && <> · {l.entityId.startsWith("NC-") ? <Link className="font-mono text-accent hover:underline" href={`/orders/${l.entityId}`}>{l.entityId}</Link> : <span className="font-mono">{l.entityId}</span>}</>}</dd>
                              <dt className="text-fg-3">Timestamp</dt><dd>{new Date(l.createdAt).toLocaleString("en-IN")}</dd>
                            </dl>
                            {l.details && <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-line bg-surface p-2.5 font-mono text-[11px] leading-relaxed text-fg-2">{JSON.stringify(l.details, null, 2)}</pre>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <Pagination page={data.page} pages={data.pages} total={data.total} label="events" onPage={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
