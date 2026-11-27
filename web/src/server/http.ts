import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import { requireActor, SESSION_COOKIE, type Actor } from "./auth";

export function tokenFrom(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return req.cookies.get(SESSION_COOKIE)?.value;
}

type Ctx = { params: Promise<Record<string, string>> };

/** Wraps a route: resolves the actor (401 if missing), maps errors to JSON. */
export function route(fn: (req: NextRequest, actor: Actor, params: Record<string, string>) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const actor = await requireActor(tokenFrom(req));
      const data = await fn(req, actor, (await ctx?.params) ?? {});
      return data instanceof NextResponse ? data : NextResponse.json(data);
    } catch (e) {
      return toResponse(e);
    }
  };
}

export function toResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json({ error: "Validation failed", code: "validation", details: e.issues }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Internal error", code: "internal" }, { status: 500 });
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  return schema.parse(raw);
}
