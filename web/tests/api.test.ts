import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { login } from "@/server/auth";
import { db } from "@/server/db";
import * as cancelRoute from "@/app/api/orders/[id]/cancel/route";
import * as refundRoute from "@/app/api/orders/[id]/refunds/route";
import * as approvalRoute from "@/app/api/approvals/[id]/route";
import * as workflowsRoute from "@/app/api/workflows/route";
import * as ordersRoute from "@/app/api/orders/route";
import * as webhookRoute from "@/app/api/webhooks/route";
import { freshWorld, stopMock } from "./helpers";

afterAll(stopMock);

const tokens: Record<string, string> = {};
const req = (url: string, role: string | null, body?: unknown) =>
  new NextRequest(`http://test${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) });

beforeAll(async () => {
  await freshWorld();
  for (const r of ["manager", "operator", "viewer"]) tokens[r] = (await login(`${r}@t.test`, "pw"))!.token;
});

describe("HTTP API permissions (backend-enforced)", () => {
  it("401 without a session", async () => {
    expect((await ordersRoute.GET(req("/api/orders", null), ctx())).status).toBe(401);
  });

  it("viewer can read but gets 403 on every mutation", async () => {
    expect((await ordersRoute.GET(req("/api/orders", "viewer"), ctx())).status).toBe(200);
    expect((await cancelRoute.POST(req("/api/orders/NC-1004/cancel", "viewer", {}), ctx({ id: "NC-1004" }))).status).toBe(403);
    expect((await refundRoute.POST(req("/api/orders/NC-1002/refunds", "viewer", { amount_minor: 100 }), ctx({ id: "NC-1002" }))).status).toBe(403);
    const wf = { name: "x", trigger: "payment.failed", conditions: [{ field: "payment.status", op: "eq", value: "failed" }], action: { type: "create_ticket", reason: "x" } };
    expect((await workflowsRoute.POST(req("/api/workflows", "viewer", wf), ctx())).status).toBe(403);
  });

  it("operator requests (202) but cannot approve (403); manager approves (200)", async () => {
    const r = await refundRoute.POST(req("/api/orders/NC-1002/refunds", "operator", { amount_minor: 1000 }), ctx({ id: "NC-1002" }));
    expect(r.status).toBe(202);
    const refund = await r.json();
    expect((await approvalRoute.POST(req(`/api/approvals/${refund.approval.id}`, "operator", { decision: "approve" }), ctx({ id: refund.approval.id }))).status).toBe(403);
    const ok = await approvalRoute.POST(req(`/api/approvals/${refund.approval.id}`, "manager", { decision: "approve" }), ctx({ id: refund.approval.id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("succeeded");
  });

  it("validates request bodies", async () => {
    expect((await refundRoute.POST(req("/api/orders/NC-1002/refunds", "operator", { amount_minor: 10.5 }), ctx({ id: "NC-1002" }))).status).toBe(400);
    expect((await refundRoute.POST(req("/api/orders/NC-1002/refunds", "operator", { amount_minor: "100" }), ctx({ id: "NC-1002" }))).status).toBe(400);
  });

  it("webhook endpoint: 400 on garbage, 200 duplicate on redelivery", async () => {
    const bad = await webhookRoute.POST(new NextRequest("http://test/api/webhooks", { method: "POST", body: "not json" }));
    expect(bad.status).toBe(400);
    const evt = { event_id: "evt-http", type: "payment.failed", occurred_at: "2026-11-22T10:05:00Z", order_id: "NC-1007", data: { status: "failed" } };
    const mk = () => new NextRequest("http://test/api/webhooks", { method: "POST", body: JSON.stringify(evt), headers: { "content-type": "application/json" } });
    expect((await (await webhookRoute.POST(mk())).json()).status).toBe("processed");
    expect((await (await webhookRoute.POST(mk())).json()).status).toBe("duplicate");
    expect(await db.webhookEvent.count({ where: { eventId: "evt-http" } })).toBe(1);
  });
});
