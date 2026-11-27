import { db } from "@/server/db";
import { route } from "@/server/http";
import { integrationHealth, probeHealth } from "@/server/services/sync";

export const GET = route(async (req) => {
  const service = req.nextUrl.searchParams.get("service") ?? undefined;
  const onlyErrors = req.nextUrl.searchParams.get("errors") === "1";
  const [probe, health, calls, lastSync, lastFailedSync] = await Promise.all([
    probeHealth(),
    integrationHealth(),
    db.integrationCall.findMany({ where: { service, ...(onlyErrors ? { ok: false } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.syncRun.findFirst({ where: { status: { in: ["succeeded", "partial"] } }, orderBy: { startedAt: "desc" } }),
    db.syncRun.findFirst({ where: { status: { in: ["failed", "partial"] } }, orderBy: { startedAt: "desc" } }),
  ]);
  return { probe, health, calls, lastSuccessfulSync: lastSync, lastFailedSync };
});
