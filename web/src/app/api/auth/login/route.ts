import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { login, SESSION_COOKIE } from "@/server/auth";
import { body, toResponse } from "@/server/http";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await body(req, z.object({ email: z.string().min(1), password: z.string().min(1) }));
    const r = await login(email, password);
    if (!r) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    const res = NextResponse.json({ token: r.token, user: { id: r.user.id, name: r.user.name, email: r.user.email, role: r.user.role } });
    res.cookies.set(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
    return res;
  } catch (e) {
    return toResponse(e);
  }
}
