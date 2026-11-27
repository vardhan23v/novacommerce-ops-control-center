import { z } from "zod";
import { body, route } from "@/server/http";
import { ask } from "@/server/services/assistant";

export const maxDuration = 60;
export const POST = route(async (req, actor) => {
  const { message } = await body(req, z.object({ message: z.string().min(1).max(1000) }));
  return ask(actor, message);
});
