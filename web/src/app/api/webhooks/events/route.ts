import { db } from "@/server/db";
import { route } from "@/server/http";

export const GET = route(async () => db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 200 }));
