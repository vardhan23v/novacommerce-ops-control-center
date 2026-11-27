import { body, route } from "@/server/http";
import { updateWorkflow, workflowSchema } from "@/server/services/workflows";

export const PATCH = route(async (req, actor, p) => updateWorkflow(actor, p.id, await body(req, workflowSchema.partial())));
