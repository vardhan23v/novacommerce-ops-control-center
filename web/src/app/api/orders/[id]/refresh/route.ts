import { route } from "@/server/http";
import { getOrder } from "@/server/services/orders";
import { refreshOrder } from "@/server/services/sync";

export const POST = route(async (_req, _a, p) => {
  await getOrder(p.id);
  const issues = await refreshOrder(p.id);
  return { issues, order: await getOrder(p.id) };
});
