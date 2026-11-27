import { NextResponse, type NextRequest } from "next/server";
import { logout, SESSION_COOKIE } from "@/server/auth";
import { tokenFrom } from "@/server/http";

export async function POST(req: NextRequest) {
  await logout(tokenFrom(req));
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
