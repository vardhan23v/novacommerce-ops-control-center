import { db } from "../db";

export type Service = "commerce" | "payments" | "shipping" | "health";

export type CallResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; error: string; data?: unknown };

const TIMEOUT_MS = Number(process.env.MOCK_API_TIMEOUT_MS ?? 5000);

export function baseUrl() {
  const u = process.env.MOCK_API_BASE_URL;
  if (!u) throw new Error("MOCK_API_BASE_URL is not configured");
  return u.replace(/\/$/, "");
}

function serviceOf(path: string): Service {
  if (path.startsWith("/commerce")) return "commerce";
  if (path.startsWith("/payments")) return "payments";
  if (path.startsWith("/shipping")) return "shipping";
  return "health";
}

/**
 * Single gateway to the external services. Every attempt is logged to IntegrationCall.
 * GETs retry on network errors / 5xx; POSTs never auto-retry (they are not idempotent upstream,
 * e.g. a retried refund could pay out twice).
 */
export async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<CallResult<T>> {
  const maxAttempts = method === "GET" ? 2 : 1;
  let last: CallResult<T> = { ok: false, status: null, error: "not attempted" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    let status: number | null = null;
    try {
      const res = await fetch(baseUrl() + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      status = res.status;
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (res.ok) {
        await log(path, method, status, true, null, started, attempt);
        return { ok: true, status, data: json as T };
      }
      const err = (json as { error?: string } | null)?.error ?? `HTTP ${status}`;
      await log(path, method, status, false, err, started, attempt);
      last = { ok: false, status, error: err, data: json };
      if (status < 500) return last; // 4xx is a definitive answer
    } catch (e) {
      const err = e instanceof Error ? (e.name === "TimeoutError" ? "timeout" : e.message) : String(e);
      await log(path, method, status, false, err, started, attempt);
      last = { ok: false, status: null, error: `unreachable: ${err}` };
    }
  }
  return last;
}

async function log(path: string, method: string, statusCode: number | null, ok: boolean, error: string | null, started: number, attempt: number) {
  try {
    await db.integrationCall.create({
      data: { service: serviceOf(path), method, path, statusCode, ok, error, durationMs: Date.now() - started, attempt },
    });
  } catch {
    // logging must never break the operation
  }
}

// Typed upstream shapes (from api-documentation.md / business_data.json)
export type UpCustomer = { id: string; name: string; email: string };
export type UpOrder = { id: string; customer_id: string; status: string; amount_minor: number; currency: string; created_at: string; channel: string };
export type UpPayment = { id: string; order_id: string; status: string; amount_minor: number; currency: string };
export type UpShipment = { id: string; order_id: string; status: string; updated_at: string };
export type UpRefund = { id: string; order_id: string; amount_minor: number; currency: string; status: string };
export type UpTicket = { id: string; order_id: string; reason: string; status: string };

export const api = {
  health: () => call<{ ok: boolean }>("GET", "/health"),
  customers: () => call<UpCustomer[]>("GET", "/commerce/customers"),
  orders: () => call<UpOrder[]>("GET", "/commerce/orders"),
  order: (id: string) => call<UpOrder>("GET", `/commerce/orders/${encodeURIComponent(id)}`),
  cancelOrder: (id: string) => call<UpOrder>("POST", `/commerce/orders/${encodeURIComponent(id)}/cancel`, {}),
  payments: () => call<UpPayment[]>("GET", "/payments/transactions"),
  payment: (id: string) => call<UpPayment>("GET", `/payments/transactions/${encodeURIComponent(id)}`),
  createRefund: (order_id: string, amount_minor: number) => call<UpRefund>("POST", "/payments/refunds", { order_id, amount_minor }),
  refunds: () => call<UpRefund[]>("GET", "/payments/refunds"),
  shipments: () => call<UpShipment[]>("GET", "/shipping/shipments"),
  shipment: (id: string) => call<UpShipment>("GET", `/shipping/shipments/${encodeURIComponent(id)}`),
  createTicket: (order_id: string, reason: string) => call<UpTicket>("POST", "/commerce/tickets", { order_id, reason }),
  tickets: () => call<UpTicket[]>("GET", "/commerce/tickets"),
};
