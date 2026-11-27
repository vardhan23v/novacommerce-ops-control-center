"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, inputCls, inr, PageHeader, Skeleton, Table, td, useApi } from "@/components/ui";

type Row = { id: string; status: string; amountMinor: number; createdAt: string; channel: string; customer: { name: string; email: string }; payment: { status: string } | null; shipment: { status: string; lastSyncError: string | null } | null };
type Page = { items: Row[]; total: number; page: number; pages: number };

function Orders() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    if (k !== "page") n.delete("page");
    router.replace(`/orders?${n.toString()}`);
  };
  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);
  const { data, error, loading, reload } = useApi<Page>(`/api/orders?${sp.toString()}`);
  const sort = sp.get("sort") ?? "createdAt";
  const dir = sp.get("dir") ?? "desc";
  const SortH = ({ k, label }: { k: string; label: string }) => (
    <button className="inline-flex items-center gap-1 uppercase" onClick={() => { const n = new URLSearchParams(sp.toString()); n.set("sort", k); n.set("dir", sort === k && dir === "desc" ? "asc" : "desc"); router.replace(`/orders?${n}`); }}>
      {label}{sort === k && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
    </button>
  );
  const Select = ({ k, label, opts }: { k: string; label: string; opts: string[] }) => (
    <select aria-label={label} className={inputCls + " w-auto"} value={sp.get(k) ?? ""} onChange={(e) => set(k, e.target.value || null)}>
      <option value="">{label}: all</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader title="Orders" subtitle={data ? `${data.total} orders match` : "Search, filter and act on orders"} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
          <form onSubmit={(e) => { e.preventDefault(); set("q", q.trim() || null); }} className="flex min-w-60 flex-1 gap-2">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order ID, customer name or email" />
            <Button type="submit">Search</Button>
          </form>
          <Select k="status" label="Order" opts={["processing", "shipped", "delivered", "cancelled"]} />
          <Select k="payment" label="Payment" opts={["captured", "failed"]} />
          <Select k="shipment" label="Shipment" opts={["pending", "shipped", "delayed", "delivered", "cancelled"]} />
          {sp.toString() && <Button variant="ghost" onClick={() => router.replace("/orders")}>Clear</Button>}
        </div>
        {error ? <div className="p-3"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={8} /></div> : data && data.items.length === 0 ? (
          <Empty title="No orders match these filters" hint="Try clearing filters, or run a sync from Integrations if nothing has been imported." />
        ) : data && (
          <>
            <Table head={[<SortH key="id" k="id" label="Order" />, "Customer", "Order status", "Payment", "Shipment", <SortH key="a" k="amountMinor" label="Amount" />, "Channel", <SortH key="c" k="createdAt" label="Created" />]}>
              {data.items.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-ink-50" onClick={() => router.push(`/orders/${o.id}`)}>
                  <td className={td}><Link href={`/orders/${o.id}`} className="font-mono text-[12px] font-medium text-ink-900 hover:underline">{o.id}</Link></td>
                  <td className={td}><div className="font-medium">{o.customer.name}</div><div className="text-[11px] text-ink-500">{o.customer.email}</div></td>
                  <td className={td}><Badge status={o.status} /></td>
                  <td className={td}>{o.payment ? <Badge status={o.payment.status} /> : "—"}</td>
                  <td className={td}><div className="flex gap-1">{o.shipment ? <Badge status={o.shipment.status} /> : "—"}{o.shipment?.lastSyncError && <Badge tone="red">lookup error</Badge>}</div></td>
                  <td className={td + " num text-right font-medium"}>{inr(o.amountMinor)}</td>
                  <td className={td + " text-ink-500"}>{o.channel}</td>
                  <td className={td + " whitespace-nowrap text-ink-500"}>{new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                </tr>
              ))}
            </Table>
            <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-[12px] text-ink-500">
              <span>Page {data.page} of {data.pages}</span>
              <div className="flex gap-1">
                <Button size="sm" disabled={data.page <= 1} onClick={() => set("page", String(data.page - 1))}><ChevronLeft className="size-3.5" />Prev</Button>
                <Button size="sm" disabled={data.page >= data.pages} onClick={() => set("page", String(data.page + 1))}>Next<ChevronRight className="size-3.5" /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export default function OrdersPage() {
  return <Suspense fallback={<Skeleton rows={8} />}><Orders /></Suspense>;
}
