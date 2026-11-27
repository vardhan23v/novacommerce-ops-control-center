import { db } from "@/server/db";
import { route } from "@/server/http";

export const GET = route(async (req) => {
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  return db.refund.findMany({ where: { status }, include: { approval: true, order: { include: { customer: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
});
