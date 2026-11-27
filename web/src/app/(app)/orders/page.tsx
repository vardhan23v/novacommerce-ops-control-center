"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, Download, ExternalLink, LifeBuoy, MoreHorizontal, RotateCcw, Search, X } from "lucide-react";
import { Badge, Button, Card, clsx, Empty, ErrorBox, inputCls, inr, Menu, PageHeader, Pagination, selectCls, Skeleton, Table, td, tr, useApi, shortDate } from "@/components/ui";
import { useCan } from "@/components/session";

type Row = { id: string; status: string; amountMinor: number; createdAt: string; channel: string; customer: { id: string; name: string; email: string }; payment: { status: string } | null; shipment: { status: string; lastSyncError: string | null } | null };
type Page = { items: Row[]; total: number; page: number; pages: number };

const FILTERS = [
  { k: "status", label: "Order", opts: ["processing", "shipped", "delivered", "cancelled"] },
  { k: "payment", label: "Payment", opts: ["captured", "failed"] },
  { k: "shipment", label: "Shipment", opts: ["pending", "shipped", "delayed", "delivered", "cancelled"] },
] as const;

function Orders() {
  const sp = useSearchParams();
  const router = useRouter();
  const canCancel = useCan("order.cancel");
  const canRefund = useCan("refund.request");
  const canTicket = useCan("ticket.create");
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    if (!("page" in patch)) n.delete("page");
    router.replace(`/orders${n.toString() ? `?${n}` : ""}`, { scroll: false });
  };
  const { data, error, loading, reload } = useApi<Page>(`/api/orders?${sp.toString()}`);
  const sort = sp.get("sort") ?? "createdAt";
  const dir = sp.get("dir") ?? "desc";
  const active = FILTERS.filter((f) => sp.get(f.k));

  const SortH = ({ k, label, right }: { k: string; label: string; right?: boolean }) => (
    <button className={clsx("inline-flex items-center gap-1 uppercase hover:text-fg", sort === k && "text-fg", right && "flex-row-reverse")} onClick={() => set({ sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc" })}>
      {label}{sort === k ? (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
    </button>
  );

  function exportCsv() {
    if (!data) return;
    const rows = [["order_id", "customer", "email", "status", "payment", "shipment", "amount_inr", "channel", "created_at"], ...data.items.map((o) => [o.id, o.customer.name, o.customer.email, o.status, o.payment?.status ?? "", o.shipment?.status ?? "", (o.amountMinor / 100).toFixed(2), o.channel, o.createdAt])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `orders-page-${data.page}.csv` });
    a.click();
  }

  return (
    <div className="anim-in">
      <PageHeader
        title="Orders"
        description={data ? <><span className="num">{data.total}</span> {active.length || sp.get("q") ? "matching orders" : "orders across all channels"}</> : "Search, filter and act on customer orders"}
        actions={<Button icon={<Download className="size-3.5" />} onClick={exportCsv} disabled={!data?.items.length}>Export page</Button>}
      />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
            <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by order ID, customer name or email" aria-label="Search orders" />
          </form>
          {FILTERS.map((f) => (
            <select key={f.k} aria-label={`${f.label} status`} className={clsx(selectCls, "w-auto min-w-36", sp.get(f.k) && "border-accent/50 bg-accent-soft/40")} value={sp.get(f.k) ?? ""} onChange={(e) => set({ [f.k]: e.target.value || null })}>
              <option value="">{f.label}: any</option>
              {f.opts.map((o) => <option key={o} value={o}>{f.label}: {o}</option>)}
            </select>
          ))}
        </div>
        {(active.length > 0 || sp.get("q")) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-subtle/40 px-3 py-2">
            <span className="text-[12px] text-fg-3">Filtered by</span>
            {sp.get("q") && <Chip onRemove={() => set({ q: null })}>“{sp.get("q")}”</Chip>}
            {active.map((f) => <Chip key={f.k} onRemove={() => set({ [f.k]: null })}>{f.label}: {sp.get(f.k)}</Chip>)}
            <button onClick={() => router.replace("/orders")} className="ml-1 text-[12px] font-medium text-accent hover:underline">Clear all</button>
          </div>
        )}
        {error ? <div className="p-4"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={10} /></div> : data && data.items.length === 0 ? (
          <Empty title="No orders match" hint="Try a different search or clear the filters. If nothing was imported, run a sync from Integrations." action={<Button onClick={() => router.replace("/orders")}>Clear filters</Button>} />
        ) : data && (
          <div className={clsx("transition-opacity", loading && "opacity-60")}>
            <Table head={[<SortH key="id" k="id" label="Order" />, "Customer", "Status", "Payment", "Shipment", { label: <SortH k="amountMinor" label="Amount" right />, align: "right" }, "Channel", <SortH key="c" k="createdAt" label="Created" />, { label: <span className="sr-only">Actions</span> }]}>
              {data.items.map((o) => (
                <tr key={o.id} className={clsx(tr, "cursor-pointer")} onClick={() => router.push(`/orders/${o.id}`)}>
                  <td className={td}><span className="font-mono text-[12px] font-medium">{o.id}</span></td>
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-fg-2">{o.customer.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                      <div className="min-w-0"><div className="truncate font-medium">{o.customer.name}</div><div className="truncate text-[12px] text-fg-3">{o.customer.email}</div></div>
                    </div>
                  </td>
                  <td className={td}><Badge status={o.status} /></td>
                  <td className={td}>{o.payment ? <Badge status={o.payment.status} /> : <span className="text-fg-3">—</span>}</td>
                  <td className={td}><div className="flex items-center gap-1">{o.shipment ? <Badge status={o.shipment.status} /> : <span className="text-fg-3">—</span>}{o.shipment?.lastSyncError && <Badge tone="bad" dot={false}>lookup error</Badge>}</div></td>
                  <td className={td + " num text-right font-medium"}>{inr(o.amountMinor)}</td>
                  <td className={td + " capitalize text-fg-2"}>{o.channel}</td>
                  <td className={td + " whitespace-nowrap text-fg-2"}>{shortDate(o.createdAt)}</td>
                  <td className={td + " w-10 text-right"}>
                    <Menu
                      trigger={(p) => <Button {...p} variant="ghost" size="sm" aria-label={`Actions for ${o.id}`} icon={<MoreHorizontal className="size-4" />} />}
                      items={[
                        { label: "Open order", icon: <ExternalLink />, onSelect: () => router.push(`/orders/${o.id}`) },
                        ...(canTicket ? [{ label: "Open support ticket", icon: <LifeBuoy />, onSelect: () => router.push(`/orders/${o.id}?action=ticket`) }] : []),
                        ...(canRefund ? [{ label: "Request refund", icon: <RotateCcw />, onSelect: () => router.push(`/orders/${o.id}?action=refund`) }] : []),
                        ...(canCancel ? ["divider" as const, { label: "Cancel order", icon: <Ban />, danger: true, onSelect: () => router.push(`/orders/${o.id}?action=cancel`) }] : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} label="orders" onPage={(p) => set({ page: String(p) })} />
          </div>
        )}
      </Card>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface pl-2.5 pr-1 text-[12px] capitalize text-fg">
      {children}
      <button onClick={onRemove} aria-label="Remove filter" className="rounded-full p-0.5 text-fg-3 hover:bg-subtle hover:text-fg"><X className="size-3" /></button>
    </span>
  );
}

export default function OrdersPage() {
  return <Suspense fallback={<Skeleton rows={10} />}><Orders /></Suspense>;
}
