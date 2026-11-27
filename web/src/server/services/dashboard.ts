import { db } from "../db";
import { integrationHealth } from "./sync";

export async function dashboard() {
  const [orderStatus, paymentStatus, shipmentStatus, totalOrders, revenue, refundStatus, pendingApprovals, openTickets, wfStats, failedCalls24h, recentExecutions, recentActivity, lastSync, health, attention] =
    await Promise.all([
      db.order.groupBy({ by: ["status"], _count: true }),
      db.payment.groupBy({ by: ["status"], _count: true, _sum: { amountMinor: true } }),
      db.shipment.groupBy({ by: ["status"], _count: true }),
      db.order.count(),
      db.order.aggregate({ _sum: { amountMinor: true } }),
      db.refund.groupBy({ by: ["status"], _count: true, _sum: { amountMinor: true } }),
      db.approval.findMany({ where: { status: "pending" }, include: { refund: true }, orderBy: { createdAt: "asc" }, take: 8 }),
      db.supportTicket.count({ where: { status: "open" } }),
      db.workflowExecution.groupBy({ by: ["status"], _count: true }),
      db.integrationCall.count({ where: { ok: false, createdAt: { gte: new Date(Date.now() - 864e5) } } }),
      db.workflowExecution.findMany({ include: { workflow: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
      db.auditLog.findMany({ where: { action: { not: "auth.login" } }, orderBy: { createdAt: "desc" }, take: 10 }),
      db.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
      integrationHealth(),
      db.order.findMany({
        where: { OR: [{ payment: { status: "failed" } }, { shipment: { status: "delayed" } }, { shipment: { lastSyncError: { not: null } } }] },
        include: { payment: true, shipment: true, customer: true },
        orderBy: { amountMinor: "desc" },
        take: 8,
      }),
    ]);
  const count = <T extends { _count: number }>(rows: T[], key: keyof T, v: string) => rows.find((r) => r[key] === v)?._count ?? 0;
  const failedRefunds = await db.refund.count({ where: { status: "failed" } });
  const failedOps = await db.operation.count({ where: { status: "failed" } });
  return {
    totals: {
      orders: totalOrders,
      grossMinor: revenue._sum.amountMinor ?? 0,
      processing: count(orderStatus, "status", "processing"),
      shipped: count(orderStatus, "status", "shipped"),
      delivered: count(orderStatus, "status", "delivered"),
      cancelled: count(orderStatus, "status", "cancelled"),
      failedPayments: count(paymentStatus, "status", "failed"),
      delayedShipments: count(shipmentStatus, "status", "delayed"),
      pendingApprovals: await db.approval.count({ where: { status: "pending" } }),
      succeededRefunds: count(refundStatus, "status", "succeeded"),
      succeededRefundMinor: refundStatus.find((r) => r.status === "succeeded")?._sum.amountMinor ?? 0,
      failedRefunds,
      failedExternalOps: failedCalls24h,
      failedOperations: failedOps,
      openTickets,
    },
    orderStatus: orderStatus.map((r) => ({ status: r.status, count: r._count })),
    paymentStatus: paymentStatus.map((r) => ({ status: r.status, count: r._count, amountMinor: r._sum.amountMinor ?? 0 })),
    shipmentStatus: shipmentStatus.map((r) => ({ status: r.status, count: r._count })),
    workflow: Object.fromEntries(wfStats.map((r) => [r.status, r._count])),
    pendingApprovals,
    recentExecutions,
    recentActivity,
    lastSync,
    health,
    attention,
  };
}
