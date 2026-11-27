/**
 * Nova Intelligence. Deterministic core: intent detection + data gathering run here, against the
 * same services and permission checks as the rest of the app. The optional CrewAI service only
 * receives the gathered facts and writes the narrative; it has no tools and cannot act.
 * Consequential actions are returned as a *proposal* that the user must confirm, and are then
 * executed through the normal endpoints (requestRefund / cancelOrder) with the user's own role.
 */
import { db } from "../db";
import { audit } from "../audit";
import { can, type Actor } from "../auth";
import { getOrder } from "./orders";

export type Proposal = { kind: "refund" | "cancel"; orderId: string; amountMinor?: number; label: string };
export type AssistantReply = {
  intent: string;
  answer: string; // deterministic summary (always present)
  narrative?: string | null; // from CrewAI when available
  engine: "deterministic" | "crewai";
  facts: unknown;
  links: { label: string; href: string }[];
  proposal?: Proposal | null;
  notice?: string;
};

const inr = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export async function ask(actor: Actor, message: string): Promise<AssistantReply> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const orderId = text.match(/NC-?\d{3,}/i)?.[0].toUpperCase().replace(/^NC-?/, "NC-");
  const amountMatch = lower.match(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)/);

  let reply: AssistantReply;

  if (/refund/.test(lower) && /(request|issue|initiate|create|start|process)/.test(lower) && orderId) {
    reply = await proposeRefund(actor, orderId, amountMatch ? Math.round(parseFloat(amountMatch[1].replace(/,/g, "")) * 100) : undefined);
  } else if (/cancel/.test(lower) && /(please|request|can you|go ahead|^cancel)/.test(lower) && orderId && !/why|explain/.test(lower)) {
    reply = await proposeCancel(actor, orderId);
  } else if (orderId) {
    reply = await investigate(orderId, lower);
  } else if (/delay/.test(lower)) {
    reply = await delayed();
  } else if (/(approval|waiting|pending)/.test(lower) && /refund|approv/.test(lower)) {
    reply = await pendingApprovals();
  } else if (/fail/.test(lower) && /payment/.test(lower)) {
    reply = await failedPayments();
  } else if (/workflow|automation/.test(lower)) {
    reply = await workflowFailures();
  } else if (/(attention|urgent|priorit|summar|today|problem|issue)/.test(lower)) {
    reply = await attention();
  } else if (/(integration|sync|service|down|outage)/.test(lower)) {
    reply = await integrationStatus();
  } else {
    reply = {
      intent: "help",
      engine: "deterministic",
      answer:
        "I can investigate an order (\"Investigate NC-1004\"), list delayed shipments, failed payments or refunds waiting for approval, summarise what needs attention, explain workflow failures, or prepare a refund or cancellation for you to confirm.",
      facts: null,
      links: [],
    };
  }

  reply = await narrate(text, reply);
  await audit(actor, "assistant.query", reply.proposal ? "order" : "assistant", reply.proposal?.orderId ?? orderId ?? null, "info", {
    intent: reply.intent,
    engine: reply.engine,
    message: text.slice(0, 200),
  });
  return reply;
}

async function investigate(orderId: string, lower: string): Promise<AssistantReply> {
  let o;
  try {
    o = await getOrder(orderId);
  } catch {
    return { intent: "investigate", engine: "deterministic", answer: `I couldn't find ${orderId} in the synced data. It may not exist, or the last sync didn't include it.`, facts: null, links: [{ label: "Orders", href: "/orders" }] };
  }
  const lines: string[] = [];
  lines.push(`${o.id} · ${o.customer.name} · ${inr(o.amountMinor)} via ${o.channel}. Order is ${o.status}.`);
  if (o.payment) lines.push(`Payment ${o.payment.id} is ${o.payment.status}${o.payment.status === "captured" ? ` (${inr(o.payment.amountMinor)})` : ""}.`);
  if (o.shipment) lines.push(`Shipment ${o.shipment.id} is ${o.shipment.status}, last carrier update ${o.shipment.updatedAt.toISOString().slice(0, 10)}.`);
  if (o.shipment?.lastSyncError) lines.push(`⚠ The latest shipping lookup failed (${o.shipment.lastSyncError}); the shipment data shown is the last known state.`);
  const failedRefunds = o.refunds.filter((r) => r.status === "failed");
  for (const r of o.refunds) lines.push(`Refund ${inr(r.amountMinor)}: ${r.status.replace("_", " ")}${r.error ? ` — ${r.error}` : ""}.`);
  if (/refund/.test(lower) && /fail|why/.test(lower) && !failedRefunds.length) lines.push("There is no failed refund recorded for this order.");
  if (o.tickets.length) lines.push(`${o.tickets.length} support ticket(s): ${o.tickets.map((t) => `${t.externalId ?? "not created"} (${t.status})`).join(", ")}.`);
  lines.push(o.eligibility.cancel ? `Cancellation: not possible — ${o.eligibility.cancel}.` : "Cancellation: eligible.");
  lines.push(o.eligibility.refund ? `Refund: not possible — ${o.eligibility.refund}.` : `Refund: eligible up to ${inr(o.eligibility.refundableMinor)} (needs manager approval).`);
  const next: string[] = [];
  if (o.payment?.status === "failed") next.push("contact the customer about the failed payment");
  if (o.shipment?.status === "delayed") next.push("check with the carrier and keep the customer informed");
  if (o.shipment?.lastSyncError) next.push("refresh the order once the shipping service recovers");
  if (failedRefunds.length) next.push("review the failed refund with finance before retrying");
  if (next.length) lines.push(`Suggested next steps: ${next.join("; ")}.`);
  return {
    intent: "investigate",
    engine: "deterministic",
    answer: lines.join("\n"),
    facts: {
      order: { id: o.id, status: o.status, amountMinor: o.amountMinor, channel: o.channel, customer: o.customer.name },
      payment: o.payment,
      shipment: o.shipment,
      refunds: o.refunds.map((r) => ({ amountMinor: r.amountMinor, status: r.status, error: r.error, approval: r.approval?.status })),
      tickets: o.tickets.map((t) => ({ id: t.externalId, status: t.status, reason: t.reason })),
      eligibility: o.eligibility,
    },
    links: [{ label: `Open ${o.id}`, href: `/orders/${o.id}` }],
  };
}

async function delayed(): Promise<AssistantReply> {
  const rows = await db.shipment.findMany({ where: { status: "delayed" }, include: { order: { include: { customer: true } } }, orderBy: { order: { amountMinor: "desc" } } });
  return {
    intent: "delayed_shipments",
    engine: "deterministic",
    answer: rows.length
      ? `${rows.length} delayed shipment(s), worth ${inr(rows.reduce((a, r) => a + r.order.amountMinor, 0))} in total:\n` +
        rows.map((r) => `• ${r.orderId} — ${r.order.customer.name}, ${inr(r.order.amountMinor)}, since ${r.updatedAt.toISOString().slice(0, 10)}`).join("\n")
      : "No shipments are currently delayed.",
    facts: rows.map((r) => ({ orderId: r.orderId, amountMinor: r.order.amountMinor, customer: r.order.customer.name, since: r.updatedAt })),
    links: [{ label: "Delayed shipments", href: "/shipments?status=delayed" }],
  };
}

async function failedPayments(): Promise<AssistantReply> {
  const rows = await db.payment.findMany({ where: { status: "failed" }, include: { order: { include: { customer: true } } }, orderBy: { orderId: "asc" } });
  const byStatus: Record<string, number> = {};
  rows.forEach((r) => (byStatus[r.order.status] = (byStatus[r.order.status] ?? 0) + 1));
  return {
    intent: "failed_payments",
    engine: "deterministic",
    answer: rows.length
      ? `${rows.length} failed payment(s), ${inr(rows.reduce((a, r) => a + r.amountMinor, 0))} uncollected. Order states: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ")}.\n` +
        rows.map((r) => `• ${r.orderId} — ${r.order.customer.name}, ${inr(r.amountMinor)}, order ${r.order.status}`).join("\n") +
        (byStatus.delivered ? "\nDelivered orders with failed payments mean goods went out unpaid — prioritise those." : "")
      : "No failed payments on record.",
    facts: rows.map((r) => ({ orderId: r.orderId, amountMinor: r.amountMinor, orderStatus: r.order.status })),
    links: [{ label: "Failed payments", href: "/payments?status=failed" }],
  };
}

async function pendingApprovals(): Promise<AssistantReply> {
  const rows = await db.approval.findMany({ where: { status: "pending" }, include: { refund: true }, orderBy: { createdAt: "asc" } });
  return {
    intent: "pending_approvals",
    engine: "deterministic",
    answer: rows.length
      ? `${rows.length} refund(s) waiting for manager approval, ${inr(rows.reduce((a, r) => a + r.refund.amountMinor, 0))} in total:\n` +
        rows.map((r) => `• ${r.refund.orderId} — ${inr(r.refund.amountMinor)}, requested by ${r.refund.requestedBy}`).join("\n")
      : "No refunds are waiting for approval.",
    facts: rows.map((r) => ({ orderId: r.refund.orderId, amountMinor: r.refund.amountMinor, requestedBy: r.refund.requestedBy, since: r.createdAt })),
    links: [{ label: "Approval queue", href: "/approvals" }],
  };
}

async function workflowFailures(): Promise<AssistantReply> {
  const rows = await db.workflowExecution.findMany({ where: { status: "failed" }, include: { workflow: true }, orderBy: { createdAt: "desc" }, take: 10 });
  return {
    intent: "workflow_failures",
    engine: "deterministic",
    answer: rows.length ? `${rows.length} recent failed workflow run(s):\n` + rows.map((r) => `• ${r.workflow.name} on ${r.orderId}: ${r.detail}`).join("\n") : "No workflow runs have failed.",
    facts: rows.map((r) => ({ workflow: r.workflow.name, orderId: r.orderId, detail: r.detail })),
    links: [{ label: "Workflows", href: "/workflows" }],
  };
}

async function integrationStatus(): Promise<AssistantReply> {
  const last = await db.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
  const errs = await db.integrationCall.findMany({ where: { ok: false, createdAt: { gte: new Date(Date.now() - 864e5) } }, orderBy: { createdAt: "desc" }, take: 5 });
  return {
    intent: "integrations",
    engine: "deterministic",
    answer: `Last sync ${last ? `${last.status} at ${last.startedAt.toISOString()}` : "never ran"}. ${errs.length ? `Recent errors:\n${errs.map((e) => `• ${e.service} ${e.method} ${e.path}: ${e.error}`).join("\n")}` : "No integration errors in the last 24 hours."}`,
    facts: { last, errors: errs },
    links: [{ label: "Integrations", href: "/integrations" }],
  };
}

async function attention(): Promise<AssistantReply> {
  const [fp, dl, ap, rf, lookup, wf] = await Promise.all([
    db.payment.count({ where: { status: "failed" } }),
    db.shipment.findMany({ where: { status: "delayed" }, include: { order: true } }),
    db.approval.count({ where: { status: "pending" } }),
    db.refund.findMany({ where: { status: { in: ["failed", "unconfirmed"] } } }),
    db.shipment.findMany({ where: { lastSyncError: { not: null } } }),
    db.workflowExecution.count({ where: { status: "failed" } }),
  ]);
  const items: string[] = [];
  const highDelay = dl.filter((d) => d.order.amountMinor > 500000);
  if (dl.length) items.push(`${dl.length} delayed shipment(s)${highDelay.length ? `, ${highDelay.length} above ₹5,000 (${highDelay.map((d) => d.orderId).join(", ")})` : ""}`);
  if (fp) items.push(`${fp} failed payment(s)`);
  if (ap) items.push(`${ap} refund(s) waiting for manager approval`);
  if (rf.length) items.push(`${rf.length} refund(s) failed or unconfirmed (${rf.map((r) => r.orderId).join(", ")})`);
  if (lookup.length) items.push(`shipping lookups failing for ${lookup.map((l) => l.orderId).join(", ")}`);
  if (wf) items.push(`${wf} failed workflow run(s)`);
  return {
    intent: "attention",
    engine: "deterministic",
    answer: items.length ? `What needs attention now:\n${items.map((i) => `• ${i}`).join("\n")}` : "Nothing needs attention right now.",
    facts: { failedPayments: fp, delayed: dl.map((d) => ({ orderId: d.orderId, amountMinor: d.order.amountMinor })), pendingApprovals: ap, problemRefunds: rf.map((r) => ({ orderId: r.orderId, status: r.status, error: r.error })), lookupErrors: lookup.map((l) => l.orderId), failedWorkflows: wf },
    links: [{ label: "Overview", href: "/" }],
  };
}

async function proposeRefund(actor: Actor, orderId: string, amountMinor?: number): Promise<AssistantReply> {
  if (!can(actor.role, "refund.request"))
    return { intent: "request_refund", engine: "deterministic", answer: `Your role (${actor.role}) can't request refunds. Ask an operator or manager.`, facts: null, links: [], notice: "permission" };
  let o;
  try {
    o = await getOrder(orderId);
  } catch {
    return { intent: "request_refund", engine: "deterministic", answer: `I couldn't find ${orderId}.`, facts: null, links: [] };
  }
  if (o.eligibility.refund) return { intent: "request_refund", engine: "deterministic", answer: `${orderId} can't be refunded: ${o.eligibility.refund}.`, facts: o.eligibility, links: [{ label: `Open ${orderId}`, href: `/orders/${orderId}` }] };
  const amt = amountMinor ?? o.eligibility.refundableMinor;
  if (amt <= 0 || amt > o.eligibility.refundableMinor)
    return { intent: "request_refund", engine: "deterministic", answer: `${inr(amt)} is more than the refundable ${inr(o.eligibility.refundableMinor)} for ${orderId}.`, facts: o.eligibility, links: [] };
  return {
    intent: "request_refund",
    engine: "deterministic",
    answer: `I can submit a refund request of ${inr(amt)} for ${orderId} (${o.customer.name}). It goes to the approval queue; nothing is paid until a manager approves. Confirm to submit.`,
    facts: o.eligibility,
    links: [{ label: `Open ${orderId}`, href: `/orders/${orderId}` }],
    proposal: { kind: "refund", orderId, amountMinor: amt, label: `Submit ${inr(amt)} refund request` },
  };
}

async function proposeCancel(actor: Actor, orderId: string): Promise<AssistantReply> {
  if (!can(actor.role, "order.cancel"))
    return { intent: "cancel", engine: "deterministic", answer: `Your role (${actor.role}) can't cancel orders.`, facts: null, links: [], notice: "permission" };
  let o;
  try {
    o = await getOrder(orderId);
  } catch {
    return { intent: "cancel", engine: "deterministic", answer: `I couldn't find ${orderId}.`, facts: null, links: [] };
  }
  if (o.eligibility.cancel) return { intent: "cancel", engine: "deterministic", answer: `${orderId} can't be cancelled: ${o.eligibility.cancel}.`, facts: o.eligibility, links: [{ label: `Open ${orderId}`, href: `/orders/${orderId}` }] };
  return {
    intent: "cancel",
    engine: "deterministic",
    answer: `${orderId} (${o.customer.name}, ${inr(o.amountMinor)}) is eligible for cancellation. Confirm to send the cancellation to Commerce.`,
    facts: o.eligibility,
    links: [{ label: `Open ${orderId}`, href: `/orders/${orderId}` }],
    proposal: { kind: "cancel", orderId, label: `Cancel ${orderId}` },
  };
}

/** Ask the CrewAI service to write a narrative from the facts. Any failure → deterministic answer stands. */
async function narrate(question: string, reply: AssistantReply): Promise<AssistantReply> {
  const url = process.env.ASSISTANT_SERVICE_URL;
  if (!url || reply.intent === "help" || reply.notice) return reply;
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.ASSISTANT_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.ASSISTANT_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({ question, intent: reply.intent, summary: reply.answer, facts: reply.facts }),
      signal: AbortSignal.timeout(Number(process.env.ASSISTANT_TIMEOUT_MS ?? 45000)),
    });
    if (!res.ok) return { ...reply, notice: `AI narrative unavailable (${res.status}); showing the deterministic analysis.` };
    const j = (await res.json()) as { narrative?: string };
    if (!j.narrative) return reply;
    return { ...reply, narrative: j.narrative, engine: "crewai" };
  } catch (e) {
    return { ...reply, notice: `AI narrative unavailable (${(e as Error).name === "TimeoutError" ? "timeout" : "unreachable"}); showing the deterministic analysis.` };
  }
}
