import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { route } from "@/server/http";

export const GET = route(async (req) => {
  const s = req.nextUrl.searchParams;
  const q = s.get("q")?.trim();
  const where: Prisma.AuditLogWhereInput = {};
  if (q) where.OR = [{ action: { contains: q, mode: "insensitive" } }, { actor: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }];
  if (s.get("outcome")) where.outcome = s.get("outcome")!;
  const page = Math.max(1, Number(s.get("page") ?? 1) || 1);
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / 50)), items };
});
