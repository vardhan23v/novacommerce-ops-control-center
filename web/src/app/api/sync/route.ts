import { db } from "@/server/db";
import { route } from "@/server/http";
import { runSync } from "@/server/services/sync";

export const GET = route(async () => db.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 }));
export const POST = route(async (_req, actor) => runSync(actor, "manual"));
