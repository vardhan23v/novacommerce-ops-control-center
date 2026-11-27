import { z } from "zod";
import { body, route } from "@/server/http";
import { cancelOrder } from "@/server/services/orders";

export const POST = route(async (req, actor, p) => {
  const { reason } = await body(req, z.object({ reason: z.string().max(500).optional() }).default({}));
  return cancelOrder(actor, p.id, reason);
});
