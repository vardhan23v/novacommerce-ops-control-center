import { NextResponse } from "next/server";
import { z } from "zod";
import { body, route } from "@/server/http";
import { requestRefund } from "@/server/services/refunds";

export const POST = route(async (req, actor, p) => {
  const b = await body(req, z.object({ amount_minor: z.number().int().positive(), reason: z.string().max(500).optional() }));
  const r = await requestRefund(actor, { orderId: p.id, amountMinor: b.amount_minor, reason: b.reason });
  return NextResponse.json(r, { status: 202 });
});
