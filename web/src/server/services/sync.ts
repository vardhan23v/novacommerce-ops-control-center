import { db } from "../db";
import { api } from "../integrations/client";
import { audit } from "../audit";
import { authorize, type Actor } from "../auth";
import { reconcileUnconfirmed } from "./refunds";

type ServiceResult = { service: string; ok: boolean; count?: number; error?: string };

/**
 * Pull all three services and upsert into the local projection.
 * A failing service never deletes or overwrites what we already have; its error is recorded.
 * Order matters: customers -> orders -> payments/shipments (foreign keys).
 */
export async function runSync(actor: Actor | null, trigger: "manual" | "auto" | "seed" = "manual") {
  if (actor) await authorize(actor, "sync.run", "sync");
  const actorName = actor?.name ?? "system";
  const run = await db.syncRun.create({ data: { trigger, actor: actorName, status: "running" } });
  const results: ServiceResult[] = [];

  const customers = await api.customers();
  const orders = await api.orders();
  if (customers.ok && orders.ok) {
    for (const c of customers.data) {
      await db.customer.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, email: c.email },
        update: { name: c.name, email: c.email, syncedAt: new Date() },
      });
    }
    let n = 0;
    for (const o of orders.data) {
      if (!(await db.customer.findUnique({ where: { id: o.customer_id } }))) continue;
      const data = {
        customerId: o.customer_id,
        status: o.status,
        amountMinor: o.amount_minor,
        currency: o.currency,
        channel: o.channel,
        createdAt: new Date(o.created_at),
        syncedAt: new Date(),
      };
      await db.order.upsert({ where: { id: o.id }, create: { id: o.id, ...data }, update: data });
      n++;
    }
    results.push({ service: "commerce", ok: true, count: n });
  } else {
    results.push({ service: "commerce", ok: false, error: (!customers.ok ? customers.error : !orders.ok ? orders.error : "") });
  }

  const known = new Set((await db.order.findMany({ select: { id: true } })).map((o) => o.id));

  const payments = await api.payments();
  if (payments.ok) {
    let n = 0;
    for (const p of payments.data) {
      if (!known.has(p.order_id)) continue;
      const data = { orderId: p.order_id, status: p.status, amountMinor: p.amount_minor, currency: p.currency, syncedAt: new Date() };
      await db.payment.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
      n++;
    }
    results.push({ service: "payments", ok: true, count: n });
  } else results.push({ service: "payments", ok: false, error: payments.error });

  const shipments = await api.shipments();
  if (shipments.ok) {
    let n = 0;
    for (const s of shipments.data) {
      if (!known.has(s.order_id)) continue;
      const data = { orderId: s.order_id, status: s.status, updatedAt: new Date(s.updated_at), syncedAt: new Date() };
      await db.shipment.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
      n++;
    }
    results.push({ service: "shipping", ok: true, count: n });
  } else results.push({ service: "shipping", ok: false, error: shipments.error });

  // Reconcile refund statuses we know about (external ids) with the Payment API.
  const refunds = await api.refunds();
  if (refunds.ok) {
    let n = 0;
    for (const r of refunds.data) {
      const local = await db.refund.findUnique({ where: { externalId: r.id } });
      if (local && local.status !== r.status && (r.status === "succeeded" || r.status === "failed")) {
        await db.refund.update({ where: { id: local.id }, data: { status: r.status } });
        n++;
      }
    }
    n += await reconcileUnconfirmed();
    results.push({ service: "refunds", ok: true, count: n });
  } else results.push({ service: "refunds", ok: false, error: refunds.error });

  const okCount = results.filter((r) => r.ok).length;
  const status = okCount === results.length ? "succeeded" : okCount === 0 ? "failed" : "partial";
  const finished = await db.syncRun.update({
    where: { id: run.id },
    data: { status, results, finishedAt: new Date() },
  });
  await audit(actor ?? "system", "integration.sync", "sync", run.id, status === "succeeded" ? "success" : "failure", { results });
  return finished;
}

/**
 * Per-order refresh used by the order page. Shipping lookups can fail per order (NC-1012 returns 503);
 * we keep the last known shipment and record the error on it so the UI can show it.
 */
export async function refreshOrder(orderId: string) {
  const issues: { service: string; error: string }[] = [];
  const o = await api.order(orderId);
  if (o.ok) {
    await db.order.update({ where: { id: orderId }, data: { status: o.data.status, amountMinor: o.data.amount_minor, syncedAt: new Date() } }).catch(() => null);
  } else issues.push({ service: "commerce", error: o.error });

  const p = await api.payment(orderId);
  if (p.ok) {
    await db.payment.updateMany({ where: { orderId }, data: { status: p.data.status, amountMinor: p.data.amount_minor, syncedAt: new Date() } });
  } else issues.push({ service: "payments", error: p.error });

  const s = await api.shipment(orderId);
  if (s.ok) {
    await db.shipment.updateMany({
      where: { orderId },
      data: { status: s.data.status, updatedAt: new Date(s.data.updated_at), syncedAt: new Date(), lastSyncError: null, lastSyncErrorAt: null },
    });
  } else {
    issues.push({ service: "shipping", error: s.error });
    await db.shipment.updateMany({ where: { orderId }, data: { lastSyncError: s.error, lastSyncErrorAt: new Date() } });
  }
  return issues;
}

export async function integrationHealth() {
  const services = ["commerce", "payments", "shipping"] as const;
  const out = [];
  for (const service of services) {
    const last = await db.integrationCall.findFirst({ where: { service }, orderBy: { createdAt: "desc" } });
    const lastOk = await db.integrationCall.findFirst({ where: { service, ok: true }, orderBy: { createdAt: "desc" } });
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [total, failed] = await Promise.all([
      db.integrationCall.count({ where: { service, createdAt: { gte: since } } }),
      db.integrationCall.count({ where: { service, ok: false, createdAt: { gte: since } } }),
    ]);
    out.push({
      service,
      status: !last ? "unknown" : last.ok ? "healthy" : "degraded",
      lastCallAt: last?.createdAt ?? null,
      lastSuccessAt: lastOk?.createdAt ?? null,
      lastError: last && !last.ok ? last.error : null,
      calls24h: total,
      failures24h: failed,
    });
  }
  return out;
}

export async function probeHealth() {
  const r = await api.health();
  return { reachable: r.ok, error: r.ok ? null : r.error };
}
