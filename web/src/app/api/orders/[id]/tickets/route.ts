import { NextResponse } from "next/server";
import { z } from "zod";
import { body, route } from "@/server/http";
import { createTicket } from "@/server/services/tickets";

export const POST = route(async (req, actor, p) => {
  const b = await body(req, z.object({ reason: z.string().min(1).max(500) }));
  return NextResponse.json(await createTicket(actor, p.id, b.reason), { status: 201 });
});
