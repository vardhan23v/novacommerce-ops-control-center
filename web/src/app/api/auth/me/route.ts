import { route } from "@/server/http";
import { can } from "@/server/auth";

export const GET = route(async (_req, actor) => ({
  ...actor,
  permissions: (["order.cancel", "refund.request", "refund.approve", "ticket.create", "workflow.manage", "sync.run"] as const).filter((p) => can(actor.role, p)),
}));
