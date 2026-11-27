import { db } from "@/server/db";
import { route } from "@/server/http";

export const GET = route(async (req) => {
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  return db.shipment.findMany({ where: { status }, include: { order: { include: { customer: true } } }, orderBy: { updatedAt: "desc" } });
});
