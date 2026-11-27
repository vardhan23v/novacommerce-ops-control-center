import { db } from "@/server/db";
import { route } from "@/server/http";

export const GET = route(async () => db.supportTicket.findMany({ include: { order: { include: { customer: true } } }, orderBy: { createdAt: "desc" }, take: 200 }));
