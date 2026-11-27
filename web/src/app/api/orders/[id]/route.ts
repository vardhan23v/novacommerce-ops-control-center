import { route } from "@/server/http";
import { getOrder } from "@/server/services/orders";

export const GET = route(async (_req, _a, p) => getOrder(p.id));
