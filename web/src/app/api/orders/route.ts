import { route } from "@/server/http";
import { listOrders } from "@/server/services/orders";

export const GET = route(async (req) => {
  const s = req.nextUrl.searchParams;
  const sort = s.get("sort");
  return listOrders({
    q: s.get("q") ?? undefined,
    status: s.get("status") ?? undefined,
    payment: s.get("payment") ?? undefined,
    shipment: s.get("shipment") ?? undefined,
    page: Number(s.get("page") ?? 1) || 1,
    pageSize: Number(s.get("pageSize") ?? 20) || 20,
    sort: sort === "amountMinor" || sort === "id" ? sort : "createdAt",
    dir: s.get("dir") === "asc" ? "asc" : "desc",
  });
});
