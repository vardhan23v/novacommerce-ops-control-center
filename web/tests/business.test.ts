import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import * as client from "@/server/integrations/client";
import { cancelOrder, listOrders } from "@/server/services/orders";
import { decideApproval, requestRefund } from "@/server/services/refunds";
import { createWorkflow, updateWorkflow, runWorkflowsFor } from "@/server/services/workflows";
import { processWebhook } from "@/server/services/webhooks";
import { refreshOrder, runSync } from "@/server/services/sync";
import { createTicket } from "@/server/services/tickets";
import { expectRejects, freshWorld, startMock, stopMock, users } from "./helpers";

afterAll(stopMock);

beforeEach(async () => {
  vi.restoreAllMocks();
  await freshWorld();
});

describe("sync / orders", () => {
  it("imports all 60 orders with payments and shipments", async () => {
    expect(await db.order.count()).toBe(60);
    expect(await db.payment.count()).toBe(60);
    expect(await db.shipment.count()).toBe(60);
    expect(await db.customer.count()).toBe(10);
  });

  it("searches, filters and paginates", async () => {
    const page = await listOrders({ page: 2, pageSize: 25 });
    expect(page.total).toBe(60);
    expect(page.items).toHaveLength(25);
    expect((await listOrders({ q: "NC-1004" })).items[0].id).toBe("NC-1004");
    expect((await listOrders({ shipment: "delayed" })).total).toBe(6);
    expect((await listOrders({ payment: "failed" })).total).toBe(8);
    expect((await listOrders({ status: "processing" })).total).toBe(23);
  });

  it("keeps local data and records errors when a service is down", async () => {
    await stopMock();
    const run = await runSync(users.operator);
    expect(run.status).toBe("failed");
    expect(await db.order.count()).toBe(60); // nothing destroyed
    expect(await db.integrationCall.count({ where: { ok: false } })).toBeGreaterThan(0);
    expect((await listOrders({})).total).toBe(60); // still usable
  });

  it("records the NC-1012 shipping 503 on the shipment without losing it", async () => {
    const issues = await refreshOrder("NC-1012");
    expect(issues.find((i) => i.service === "shipping")?.error).toMatch(/carrier/);
    const s = await db.shipment.findUnique({ where: { orderId: "NC-1012" } });
    expect(s?.status).toBe("delivered");
    expect(s?.lastSyncError).toMatch(/carrier/);
  });
});

describe("cancellation", () => {
  it("rejects shipped, delivered and delayed orders before calling Commerce", async () => {
    const spy = vi.spyOn(client.api, "cancelOrder");
    await expectRejects(cancelOrder(users.operator, "NC-1001"), 409); // shipped
    await expectRejects(cancelOrder(users.operator, "NC-1002"), 409); // delivered
    await expectRejects(cancelOrder(users.operator, "NC-1006"), 409); // shipped + delayed
    expect(spy).not.toHaveBeenCalled();
  });

  it("cancels an eligible order through Commerce", async () => {
    const o = await cancelOrder(users.operator, "NC-1004", "customer request");
    expect(o.status).toBe("cancelled");
    const up = await client.api.order("NC-1004");
    expect(up.ok && up.data.status).toBe("cancelled");
  });

  it("does not change local state if Commerce fails", async () => {
    await stopMock();
    await expectRejects(cancelOrder(users.operator, "NC-1005"), 502);
    expect((await db.order.findUnique({ where: { id: "NC-1005" } }))?.status).toBe("processing");
    expect(await db.operation.count({ where: { orderId: "NC-1005", status: "failed" } })).toBe(1);
  });

  it("does not trust local state when Commerce says 409", async () => {
    // Local projection says processing, but upstream shipped meanwhile.
    vi.spyOn(client.api, "cancelOrder").mockResolvedValue({ ok: false, status: 409, error: "already shipped" });
    await expectRejects(cancelOrder(users.operator, "NC-1009"), 409);
    expect((await db.order.findUnique({ where: { id: "NC-1009" } }))?.status).toBe("processing");
  });
});

describe("refunds + approvals", () => {
  it("rejects failed payments, processing orders and bad amounts", async () => {
    await expectRejects(requestRefund(users.operator, { orderId: "NC-1007", amountMinor: 100 }), 409); // failed payment
    await expectRejects(requestRefund(users.operator, { orderId: "NC-1004", amountMinor: 100 }), 409); // processing
    await expectRejects(requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 0 }), 400);
    await expectRejects(requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 175001 }), 409);
  });

  it("creates an approval and does not call the Payment API until a manager approves", async () => {
    const spy = vi.spyOn(client.api, "createRefund");
    const r = await requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 50000 });
    expect(r.status).toBe("pending_approval");
    expect(r.approval?.status).toBe("pending");
    expect(spy).not.toHaveBeenCalled();

    await expectRejects(decideApproval(users.operator, r.approval!.id, "approve"), 403);
    expect(spy).not.toHaveBeenCalled();

    const done = await decideApproval(users.manager, r.approval!.id, "approve");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(done?.status).toBe("succeeded");
    expect(done?.externalId).toMatch(/^R-/);
  });

  it("approving twice executes once", async () => {
    const spy = vi.spyOn(client.api, "createRefund");
    const r = await requestRefund(users.manager, { orderId: "NC-1017", amountMinor: 1000 });
    const results = await Promise.allSettled([
      decideApproval(users.manager, r.approval!.id, "approve"),
      decideApproval(users.manager, r.approval!.id, "approve"),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("records NC-1010's failed refund as failed even though the API returned 201", async () => {
    const r = await requestRefund(users.operator, { orderId: "NC-1010", amountMinor: 475000 });
    const done = await decideApproval(users.manager, r.approval!.id, "approve");
    expect(done?.status).toBe("failed");
    expect(done?.error).toMatch(/failed/);
    // A failed refund doesn't reserve the money: the full amount can be requested again.
    const again = await requestRefund(users.operator, { orderId: "NC-1010", amountMinor: 475000 });
    expect(again.status).toBe("pending_approval");
  });

  it("pending refunds reserve the captured amount", async () => {
    await requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 100000 });
    await expectRejects(requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 75001 }), 409);
    await requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 75000 });
  });

  it("rejection never calls the Payment API", async () => {
    const spy = vi.spyOn(client.api, "createRefund");
    const r = await requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 100 });
    const d = await decideApproval(users.manager, r.approval!.id, "reject", "duplicate");
    expect(d?.status).toBe("rejected");
    expect(spy).not.toHaveBeenCalled();
  });

  it("an unreachable Payment API leaves the refund unconfirmed, not succeeded, and is not retried", async () => {
    const spy = vi.spyOn(client.api, "createRefund").mockResolvedValue({ ok: false, status: null, error: "unreachable: timeout" });
    const r = await requestRefund(users.operator, { orderId: "NC-1002", amountMinor: 100 });
    const d = await decideApproval(users.manager, r.approval!.id, "approve");
    expect(d?.status).toBe("unconfirmed");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("permissions", () => {
  it("viewer cannot cancel, refund, ticket, sync or manage workflows; denials are audited", async () => {
    await expectRejects(cancelOrder(users.viewer, "NC-1004"), 403);
    await expectRejects(requestRefund(users.viewer, { orderId: "NC-1002", amountMinor: 100 }), 403);
    await expectRejects(createTicket(users.viewer, "NC-1002", "x"), 403);
    await expectRejects(runSync(users.viewer), 403);
    await expectRejects(
      createWorkflow(users.viewer, { name: "x", trigger: "payment.failed", conditions: [{ field: "payment.status", op: "eq", value: "failed" }], action: { type: "create_ticket", reason: "x" }, enabled: true }),
      403,
    );
    expect(await db.auditLog.count({ where: { outcome: "denied" } })).toBe(5);
    expect((await db.order.findUnique({ where: { id: "NC-1004" } }))?.status).toBe("processing");
  });
});

describe("webhooks + workflows", () => {
  const shipEvt = { event_id: "evt-001", type: "shipment.updated", occurred_at: "2026-11-22T10:00:00Z", order_id: "NC-1001", data: { status: "delayed" } };

  async function delayedHighValueWorkflow() {
    return createWorkflow(users.operator, {
      name: "delayed > 5000",
      trigger: "shipment.updated",
      conditions: [
        { field: "shipment.status", op: "eq", value: "delayed" },
        { field: "order.amount_minor", op: "gt", value: 500000 },
      ],
      action: { type: "create_ticket", reason: "Delayed high-value order" },
      enabled: true,
    });
  }

  it("updates the projection and dedupes by event_id", async () => {
    const a = await processWebhook(shipEvt);
    expect(a.status).toBe("processed");
    expect((await db.shipment.findUnique({ where: { orderId: "NC-1001" } }))?.status).toBe("delayed");
    const b = await processWebhook(shipEvt);
    expect(b.status).toBe("duplicate");
    expect(await db.webhookEvent.count()).toBe(1);
  });

  it("rejects invalid events and safely ignores unknown orders", async () => {
    expect((await processWebhook({ type: "shipment.updated" })).status).toBe("rejected");
    expect((await processWebhook({ ...shipEvt, type: "order.exploded" })).status).toBe("rejected");
    const r = await processWebhook({ ...shipEvt, event_id: "evt-x", order_id: "NC-9999" });
    expect(r.status).toBe("ignored");
  });

  it("skips a workflow when conditions don't match (NC-1001 is ₹1,375)", async () => {
    await delayedHighValueWorkflow();
    await processWebhook(shipEvt);
    const ex = await db.workflowExecution.findMany();
    expect(ex).toHaveLength(1);
    expect(ex[0].status).toBe("skipped");
    expect(await db.supportTicket.count()).toBe(0);
  });

  it("creates a ticket when conditions match, and runs once per event", async () => {
    await delayedHighValueWorkflow();
    const evt = { ...shipEvt, event_id: "evt-ship-1016", order_id: "NC-1016", occurred_at: "2026-11-26T10:00:00Z" };
    await processWebhook(evt);
    await processWebhook(evt);
    await runWorkflowsFor({ eventId: evt.event_id, trigger: "shipment.updated", orderId: "NC-1016" });
    const ex = await db.workflowExecution.findMany();
    expect(ex).toHaveLength(1);
    expect(ex[0].status).toBe("succeeded");
    const t = await db.supportTicket.findMany();
    expect(t).toHaveLength(1);
    expect(t[0].externalId).toMatch(/^T-/);
  });

  it("records failed actions", async () => {
    await delayedHighValueWorkflow();
    vi.spyOn(client.api, "createTicket").mockResolvedValue({ ok: false, status: 503, error: "down" });
    await processWebhook({ ...shipEvt, event_id: "e2", order_id: "NC-1016", occurred_at: "2026-11-26T10:00:00Z" });
    const ex = await db.workflowExecution.findFirst();
    expect(ex?.status).toBe("failed");
    expect(ex?.detail).toMatch(/down/);
  });

  it("refund actions only create a pending approval", async () => {
    const spy = vi.spyOn(client.api, "createRefund");
    await createWorkflow(users.manager, {
      name: "refund on cancel",
      trigger: "order.cancelled",
      conditions: [{ field: "payment.status", op: "eq", value: "captured" }],
      action: { type: "request_refund", amount: "full" },
      enabled: true,
    });
    await processWebhook({ event_id: "evt-003", type: "order.cancelled", occurred_at: "2026-11-22T10:10:00Z", order_id: "NC-1004", data: { status: "cancelled" } });
    const r = await db.refund.findFirst({ include: { approval: true } });
    expect(r?.status).toBe("pending_approval");
    expect(r?.amountMinor).toBe(250000);
    expect(r?.approval?.status).toBe("pending");
    expect(spy).not.toHaveBeenCalled();
  });

  it("disabled workflows don't run", async () => {
    const w = await delayedHighValueWorkflow();
    await updateWorkflow(users.operator, w.id, { enabled: false });
    await processWebhook({ ...shipEvt, event_id: "e3", order_id: "NC-1016", occurred_at: "2026-11-26T10:00:00Z" });
    expect(await db.workflowExecution.count()).toBe(0);
  });

  it("payment.failed marks the payment failed", async () => {
    await processWebhook({ event_id: "evt-p", type: "payment.failed", occurred_at: "2026-11-22T10:05:00Z", order_id: "NC-1005", data: { status: "failed" } });
    expect((await db.payment.findUnique({ where: { orderId: "NC-1005" } }))?.status).toBe("failed");
  });
});

// keep the mock alive between files
export { startMock };
