"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Card, Empty, ErrorBox, inputCls, inr, PageHeader, Skeleton, Table, td, useApi } from "@/components/ui";

type P = { id: string; orderId: string; status: string; amountMinor: number; order: { status: string; customer: { name: string }; refunds: { amountMinor: number; status: string }[] } };

function Payments() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = sp.get("status") ?? "";
  const { data, error, loading, reload } = useApi<P[]>(`/api/payments${status ? `?status=${status}` : ""}`);
  return (
    <>
      <PageHeader title="Payments" subtitle="Payment transactions from the Payment service, with refunds recorded here"
        actions={<select aria-label="Status" className={inputCls + " w-auto"} value={status} onChange={(e) => router.replace(`/payments${e.target.value ? `?status=${e.target.value}` : ""}`)}><option value="">All statuses</option><option value="captured">captured</option><option value="failed">failed</option></select>} />
      <Card pad={false}>
        {error ? <div className="p-3"><ErrorBox error={error} onRetry={reload} /></div> : loading && !data ? <div className="p-4"><Skeleton rows={8} /></div> : !data?.length ? <Empty title="No payments" /> : (
          <Table head={["Transaction", "Order", "Customer", "Status", "Amount", "Refunded", "Order status"]}>
            {data.map((p) => {
              const refunded = p.order.refunds.filter((r) => r.status === "succeeded").reduce((a, r) => a + r.amountMinor, 0);
              return (
                <tr key={p.id} className="hover:bg-ink-50">
                  <td className={td + " font-mono text-[12px]"}>{p.id}</td>
                  <td className={td}><Link href={`/orders/${p.orderId}`} className="font-mono text-[12px] font-medium hover:underline">{p.orderId}</Link></td>
                  <td className={td}>{p.order.customer.name}</td>
                  <td className={td}><Badge status={p.status} /></td>
                  <td className={td + " num font-medium"}>{inr(p.amountMinor)}</td>
                  <td className={td + " num"}>{refunded ? inr(refunded) : "—"}</td>
                  <td className={td}><Badge status={p.order.status} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Skeleton />}><Payments /></Suspense>; }
