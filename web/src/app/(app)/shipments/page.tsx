"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Card, Empty, ErrorBox, fullDate, inputCls, inr, PageHeader, Skeleton, Table, td, useApi, when } from "@/components/ui";

type S = { id: string; orderId: string; status: string; updatedAt: string; lastSyncError: string | null; lastSyncErrorAt: string | null; order: { amountMinor: number; status: string; customer: { name: string } } };

function Shipments() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = sp.get("status") ?? "";
  const { data, error, loading, reload } = useApi<S[]>(`/api/shipments${status ? `?status=${status}` : ""}`);
  return (
    <>
      <PageHeader title="Shipments" subtitle="Carrier status from the Shipping service"
        actions={<select aria-label="Status" className={inputCls + " w-auto"} value={status} onChange={(e) => router.replace(`/shipments${e.target.value ? `?status=${e.target.value}` : ""}`)}><option value="">All statuses</option>{["pending", "shipped", "delayed", "delivered", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select>} />
      <Card pad={false}>
        {error ? <div className="p-3"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={8} /></div> : !data?.length ? <Empty title="No shipments" /> : (
          <Table head={["Shipment", "Order", "Customer", "Status", "Order value", "Carrier update", "Lookup"]}>
            {data.map((s) => (
              <tr key={s.id} className="hover:bg-ink-50">
                <td className={td + " font-mono text-[12px]"}>{s.id}</td>
                <td className={td}><Link href={`/orders/${s.orderId}`} className="font-mono text-[12px] font-medium hover:underline">{s.orderId}</Link></td>
                <td className={td}>{s.order.customer.name}</td>
                <td className={td}><Badge status={s.status} /></td>
                <td className={td + " num"}>{inr(s.order.amountMinor)}</td>
                <td className={td + " text-ink-500"}>{fullDate(s.updatedAt)}</td>
                <td className={td}>{s.lastSyncError ? <span className="text-[11px] text-rose-600" title={s.lastSyncError}>failed {when(s.lastSyncErrorAt)}</span> : <span className="text-[11px] text-ink-400">ok</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Skeleton />}><Shipments /></Suspense>; }
