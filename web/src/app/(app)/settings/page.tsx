"use client";
import { Check, Minus, Monitor, Moon, Sun } from "lucide-react";
import { Badge, Card, clsx, ErrorBox, KeyValue, PageHeader, SkeletonBlock, useApi } from "@/components/ui";
import { useMe } from "@/components/session";
import { useTheme, type Theme } from "@/components/theme";

type S = { roles: Record<"viewer" | "operator" | "manager", string[]>; integrations: { mockHost: string | null; timeoutMs: number; webhookSecretConfigured: boolean; assistantServiceConfigured: boolean } };
const PERMS: [string, string][] = [
  ["read", "View orders, payments, shipments and activity"],
  ["order.cancel", "Cancel eligible orders"],
  ["refund.request", "Request refunds"],
  ["refund.approve", "Approve or reject refunds"],
  ["ticket.create", "Create support tickets"],
  ["workflow.manage", "Create, edit and toggle workflows"],
  ["sync.run", "Run integration sync"],
];

export default function Settings() {
  const me = useMe();
  const [theme, setTheme] = useTheme();
  const { data, error, reload } = useApi<S>("/api/settings");
  return (
    <div className="anim-in max-w-4xl">
      <PageHeader title="Settings" description="Your profile, appearance, role permissions and integration configuration" />
      <div className="space-y-4">
        <Card title="Profile">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent">{me.name.split(" ").map((s) => s[0]).join("")}</span>
            <div className="flex-1"><div className="text-[15px] font-semibold">{me.name}</div><div className="text-[13px] text-fg-2">{me.email}</div></div>
            <Badge tone="accent" dot={false} className="capitalize">{me.role}</Badge>
          </div>
        </Card>
        <Card title="Appearance" description="Stored in this browser">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as [Theme, string, typeof Sun][]).map(([v, l, I]) => (
              <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)}
                className={clsx("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors", theme === v ? "border-accent bg-accent-soft/60 font-medium ring-1 ring-accent" : "border-line text-fg-2 hover:border-line-strong")}>
                <I className={clsx("size-4", theme === v ? "text-accent" : "text-fg-3")} />{l}
              </button>
            ))}
          </div>
        </Card>
        <Card title="Roles & permissions" description="Enforced on the server for every API call — hiding buttons is only a convenience" pad={false}>
          {error ? <div className="p-4"><ErrorBox error={error} onRetry={reload} /></div> : !data ? <div className="p-4"><SkeletonBlock className="h-48" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-[0.04em] text-fg-3">
                  <th className="px-4 py-2 text-left font-medium">Permission</th>
                  {(["viewer", "operator", "manager"] as const).map((r) => <th key={r} className={clsx("w-28 px-3 py-2 text-center font-medium", me.role === r && "text-accent")}>{r}{me.role === r && " (you)"}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {PERMS.map(([p, label]) => (
                    <tr key={p}>
                      <td className="px-4 py-2.5"><div>{label}</div><div className="font-mono text-[11px] text-fg-3">{p}</div></td>
                      {(["viewer", "operator", "manager"] as const).map((r) => (
                        <td key={r} className={clsx("px-3 py-2.5 text-center", me.role === r && "bg-accent-soft/30")}>
                          {data.roles[r].includes(p) ? <Check className="mx-auto size-4 text-ok" aria-label="allowed" /> : <Minus className="mx-auto size-4 text-fg-3" aria-label="not allowed" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Integration configuration" description="Read-only. Secrets are never shown.">
          {!data ? <SkeletonBlock className="h-24" /> : (
            <KeyValue items={[
              ["External services host", <span key="h" className="font-mono text-[12px]">{data.integrations.mockHost ?? "not configured"}</span>],
              ["Request timeout", `${data.integrations.timeoutMs} ms`],
              ["Webhook endpoint", <span key="w" className="font-mono text-[12px]">POST /api/webhooks</span>],
              ["Webhook shared secret", data.integrations.webhookSecretConfigured ? <Badge key="s" tone="ok">Configured</Badge> : <Badge key="s" tone="neutral">Not set</Badge>],
              ["Nova Intelligence AI service", data.integrations.assistantServiceConfigured ? <Badge key="a" tone="violet">CrewAI connected</Badge> : <Badge key="a" tone="neutral">Rule-based only</Badge>],
            ]} />
          )}
        </Card>
      </div>
    </div>
  );
}
