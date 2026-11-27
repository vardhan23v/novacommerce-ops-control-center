import { db } from "../db";
import { api } from "../integrations/client";
import { audit } from "../audit";
import { authorize, type Actor } from "../auth";
import { badRequest, notFound, upstream } from "../errors";

/** Create a support ticket via the Commerce API. A failed upstream call is stored as a failed ticket. */
export async function createTicket(actor: Actor, orderId: string, reason: string, source: "manual" | "workflow" | "assistant" = "manual") {
  await authorize(actor, "ticket.create", "order", orderId);
  if (!reason?.trim()) throw badRequest("A reason is required");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound(`Order ${orderId} not found`);

  const res = await api.createTicket(orderId, reason.trim());
  if (!res.ok) {
    const t = await db.supportTicket.create({
      data: { orderId, reason: reason.trim(), status: "failed", error: `${res.status ?? "unreachable"}: ${res.error}`, createdBy: actor.name, source },
    });
    await audit(actor, "ticket.create", "order", orderId, "failure", { ticketId: t.id, error: res.error });
    throw upstream(`Commerce API could not create the ticket: ${res.error}`, { ticketId: t.id });
  }
  const t = await db.supportTicket.create({
    data: { orderId, reason: reason.trim(), status: res.data.status, externalId: res.data.id, createdBy: actor.name, source },
  });
  await audit(actor, "ticket.create", "order", orderId, "success", { ticketId: t.id, externalId: res.data.id, source });
  return t;
}
