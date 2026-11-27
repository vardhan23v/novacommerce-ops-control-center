import { NextResponse } from "next/server";
import { body, route } from "@/server/http";
import { createWorkflow, listWorkflows, workflowSchema } from "@/server/services/workflows";

export const GET = route(async () => listWorkflows());
export const POST = route(async (req, actor) => NextResponse.json(await createWorkflow(actor, await body(req, workflowSchema)), { status: 201 }));
