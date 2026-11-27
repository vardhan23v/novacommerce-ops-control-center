import { z } from "zod";
import { body, route } from "@/server/http";
import { decideApproval } from "@/server/services/refunds";

export const POST = route(async (req, actor, p) => {
  const b = await body(req, z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() }));
  return decideApproval(actor, p.id, b.decision, b.note);
});
