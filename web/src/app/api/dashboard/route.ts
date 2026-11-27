import { route } from "@/server/http";
import { dashboard } from "@/server/services/dashboard";

export const GET = route(async () => dashboard());
