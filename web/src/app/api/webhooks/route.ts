import { NextResponse, type NextRequest } from "next/server";
import { processWebhook } from "@/server/services/webhooks";
import { toResponse } from "@/server/http";

/**
 * Upstream event receiver. Not session-authenticated (it's called by other systems);
 * if WEBHOOK_SECRET is set, requests must send it in the x-webhook-secret header.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && req.headers.get("x-webhook-secret") !== secret) return NextResponse.json({ error: "invalid webhook secret" }, { status: 401 });
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ status: "rejected", detail: "body is not valid JSON" }, { status: 400 });
    }
    const events = Array.isArray(raw) ? raw : [raw];
    const results = [];
    for (const e of events) results.push(await processWebhook(e));
    const code = results.every((r) => r.status === "rejected") ? 400 : 200;
    return NextResponse.json(Array.isArray(raw) ? { results } : results[0], { status: code });
  } catch (e) {
    return toResponse(e);
  }
}
