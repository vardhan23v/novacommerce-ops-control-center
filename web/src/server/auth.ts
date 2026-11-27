import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { forbidden, unauthorized } from "./errors";
import { audit } from "./audit";

export const SESSION_COOKIE = "nova_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type Actor = { id: string; name: string; email: string; role: Role };

export type Permission =
  | "read"
  | "order.cancel"
  | "refund.request"
  | "refund.approve"
  | "ticket.create"
  | "workflow.manage"
  | "sync.run";

const MATRIX: Record<Role, Permission[]> = {
  viewer: ["read"],
  operator: ["read", "order.cancel", "refund.request", "ticket.create", "workflow.manage", "sync.run"],
  manager: ["read", "order.cancel", "refund.request", "refund.approve", "ticket.create", "workflow.manage", "sync.run"],
};

export function can(role: Role, p: Permission) {
  return MATRIX[role].includes(p);
}

/** Throws 403 and records the denial. The single backend permission gate. */
export async function authorize(actor: Actor, p: Permission, entity = "permission", entityId: string | null = null) {
  if (!can(actor.role, p)) {
    await audit(actor, `denied:${p}`, entity, entityId, "denied", { role: actor.role });
    throw forbidden(`Role '${actor.role}' cannot perform '${p}'`);
  }
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function login(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit(email || "unknown", "auth.login", "user", null, "failure");
    return null;
  }
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: { id: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  await audit({ id: user.id, name: user.name, email: user.email, role: user.role }, "auth.login", "user", user.id, "success");
  return { token, user };
}

export async function logout(token: string | undefined) {
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function actorFromToken(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  const u = s.user;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export async function requireActor(token: string | undefined | null): Promise<Actor> {
  const a = await actorFromToken(token);
  if (!a) throw unauthorized();
  return a;
}

/** Workflows act as a system actor with operator-level rights (they can only *request* refunds). */
export const systemActor = (label: string): Actor => ({ id: "system", name: label, email: "system@local", role: "operator" });
