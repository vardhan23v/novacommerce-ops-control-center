import { route } from "@/server/http";
import { listApprovals } from "@/server/services/refunds";

export const GET = route(async (req) => listApprovals(req.nextUrl.searchParams.get("status") ?? undefined));
