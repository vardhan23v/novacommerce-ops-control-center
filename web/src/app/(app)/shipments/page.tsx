"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Truck } from "lucide-react";
import { Badge, Card, Empty, ErrorBox, fullDate, inr, OrderLink, PageHeader, Segmented, Skeleton, Table, td, tr, useApi, when } from "@/components/ui";

type S = { id: string; orderId: string; status: string; updatedAt: string; lastSyncError: string | null; lastSyncErrorAt: string | null; order: { amountMinor: number; status: string; customer: { name: string } } };
const STATUSES = ["pending", "shipped", "delayed", "delivered", "cancelled"] as const;

function Shipments() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = (sp.get("status") ?? "") as "" | (typeof STATUSES)[number];
  const all = useApi<S[]>("/api/shipments");
  const rows = (all.data ?? []).filter((s) => !status || s.status === status);
  const cnt = (s?: string) => (all.data ?? []).filter((x) => !s || x.status === s).length;
  const lookupErrors = (all.data ?? []).filter((s) => s.lastSyncError).length;

  return (
    <div className="anim-in">
      <PageHeader title="Shipments" description={<>Carrier status from the Shipping service{lookupErrors > 0 && <> · <span className="text-bad">{lookupErrors} with lookup errors</span></>}</>}
        actions={<Segmented value={status} onChange={(v) => router.replace(`/shipments${v ? `?status=${v}` : ""}`)} options={[{ value: "", label: "All", count: cnt() }, ...STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: cnt(s) }))]} />} />
      <Card pad={false}>
        {all.error ? <div className="p-4"><ErrorBox error={all.error} onRetry={all.reload} /></div> : !all.data ? <div className="p-4"><Skeleton rows={10} /></div> : !rows.length ? <Empty title="No shipments" icon={<Truck className="size-5" />} /> : (
          <Table head={["Shipment", "Order", "Customer", "Status", { label: "Order value", align: "right" }, "Carrier update", "Lookup"]}>
            {rows.map((s) => (
              <tr key={s.id} className={tr + " cursor-pointer"} onClick={() => router.push(`/orders/${s.orderId}`)}>
                <td className={td + " font-mono text-[12px] text-fg-2"}>{s.id}</td>
                <td className={td}><OrderLink id={s.orderId} /></td>
                <td className={td}>{s.order.customer.name}</td>
                <td className={td}><Badge status={s.status} /></td>
                <td className={td + " num text-right font-medium"}>{inr(s.order.amountMinor)}</td>
                <td className={td + " whitespace-nowrap text-fg-2"}>{fullDate(s.updatedAt)}</td>
                <td className={td}>{s.lastSyncError ? <Badge tone="bad" dot={false}><span title={s.lastSyncError}>failed {when(s.lastSyncErrorAt)}</span></Badge> : <span className="text-[12px] text-fg-3">OK</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Skeleton />}><Shipments /></Suspense>; }
