import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorFromToken, can, SESSION_COOKIE } from "@/server/auth";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const actor = await actorFromToken(token);
  if (!actor) redirect("/login");
  const permissions = (["order.cancel", "refund.request", "refund.approve", "ticket.create", "workflow.manage", "sync.run"] as const).filter((p) => can(actor.role, p));
  return <Shell me={{ ...actor, permissions }}>{children}</Shell>;
}
