import { route } from "@/server/http";
import { listExecutions } from "@/server/services/workflows";

export const GET = route(async () => listExecutions(200));
