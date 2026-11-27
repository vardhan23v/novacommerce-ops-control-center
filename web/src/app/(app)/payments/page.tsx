"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, inr, OrderLink, PageHeader, Segmented, Skeleton, Table, td, tr, useApi } from "@/components/ui";

type P = { id: string; orderId: string; status: string; amountMinor: number; order: { status: string; customer: { name: string }; refunds: { amountMinor: number; status: string }[] } };

function Payments() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = (sp.get("status") ?? "") as "" | "captured" | "failed";
  const all = useApi<P[]>("/api/payments");
  const rows = (all.data ?? []).filter((p) => !status || p.status === status);
  const sum = (s?: string) => (all.data ?? []).filter((p) => !s || p.status === s).reduce((a, p) => a + p.amountMinor, 0);
  const cnt = (s?: string) => (all.data ?? []).filter((p) => !s || p.status === s).length;
  const refunded = (all.data ?? []).flatMap((p) => p.order.refunds).filter((r) => r.status === "succeeded").reduce((a, r) => a + r.amountMinor, 0);

  return (
    <div className="anim-in">
      <PageHeader title="Payments" description="Transactions from the Payment service, with refunds recorded by this app"
        actions={<Segmented value={status} onChange={(v) => router.replace(`/payments${v ? `?status=${v}` : ""}`)} options={[{ value: "", label: "All", count: cnt() }, { value: "captured", label: "Captured", count: cnt("captured") }, { value: "failed", label: "Failed", count: cnt("failed") }]} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Captured", inr(sum("captured")), ""], ["Failed (uncollected)", inr(sum("failed")), "text-bad"], ["Refunded", inr(refunded), ""], ["Net captured", inr(sum("captured") - refunded), ""]].map(([l, v, c]) => (
          <div key={l} className="rounded-card border border-line bg-surface px-4 py-3 shadow-card"><div className="text-[12px] text-fg-3">{l}</div><div className={`num mt-1 text-[17px] font-semibold ${c}`}>{all.data ? v : "—"}</div></div>
        ))}
      </div>
      <Card pad={false}>
        {all.error ? <div className="p-4"><ErrorBox error={all.error} onRetry={all.reload} /></div> : !all.data ? <div className="p-4"><Skeleton rows={10} /></div> : !rows.length ? <Empty title="No payments" icon={<CreditCard className="size-5" />} /> : (
          <Table head={["Transaction", "Order", "Customer", "Status", { label: "Amount", align: "right" }, { label: "Refunded", align: "right" }, "Order status"]}>
            {rows.map((p) => {
              const r = p.order.refunds.filter((x) => x.status === "succeeded").reduce((a, x) => a + x.amountMinor, 0);
              return (
                <tr key={p.id} className={tr + " cursor-pointer"} onClick={() => router.push(`/orders/${p.orderId}`)}>
                  <td className={td + " font-mono text-[12px] text-fg-2"}>{p.id}</td>
                  <td className={td}><OrderLink id={p.orderId} /></td>
                  <td className={td}>{p.order.customer.name}</td>
                  <td className={td}><Badge status={p.status} /></td>
                  <td className={td + " num text-right font-medium"}>{inr(p.amountMinor)}</td>
                  <td className={td + " num text-right text-fg-2"}>{r ? inr(r) : "—"}</td>
                  <td className={td}><Badge status={p.order.status} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Skeleton />}><Payments /></Suspense>; }
