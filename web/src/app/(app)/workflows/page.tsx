"use client";
import { useState } from "react";
import { AlertTriangle, Ban, CreditCard, LifeBuoy, Pencil, Plus, RotateCcw, Trash2, Truck, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { api, Badge, Button, Callout, Card, clsx, Empty, ErrorBox, Field, inputCls, inr, OrderLink, PageHeader, Segmented, selectCls, Sheet, SkeletonBlock, Switch, Table, td, tr, useApi, useToast, when } from "@/components/ui";
import { useCan } from "@/components/session";

type Cond = { field: string; op: string; value: string | number };
type Action = { type: "create_ticket"; reason: string } | { type: "request_refund"; amount: "full" | number; reason?: string };
type W = { id: string; name: string; trigger: string; conditions: Cond[]; action: Action; enabled: boolean; createdBy: string; updatedAt: string; stats: Record<string, number> };
type E = { id: string; status: string; detail: string | null; orderId: string | null; eventId: string; createdAt: string; workflow: { name: string } };

const TRIGGERS = {
  "payment.failed": { label: "Payment failure", icon: CreditCard },
  "shipment.updated": { label: "Shipment update", icon: Truck },
  "order.cancelled": { label: "Order cancellation", icon: Ban },
} as const;
const FIELDS = { "order.amount_minor": "Order amount", "order.status": "Order status", "payment.status": "Payment status", "shipment.status": "Shipment status", "order.channel": "Order channel" } as const;
const OPS = { eq: "is", neq: "is not", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most" } as const;
const VALUES: Record<string, string[]> = {
  "order.status": ["processing", "shipped", "delivered", "cancelled"],
  "payment.status": ["captured", "failed"],
  "shipment.status": ["pending", "shipped", "delayed", "delivered", "cancelled"],
};

const fieldLabel = (f: string) => FIELDS[f as keyof typeof FIELDS] ?? f;
const opLabel = (o: string) => OPS[o as keyof typeof OPS] ?? o;
const valueLabel = (c: Cond) => (c.field === "order.amount_minor" ? inr(Number(c.value)) : String(c.value));

type Draft = { id?: string; name: string; trigger: keyof typeof TRIGGERS; conditions: { field: string; op: string; value: string }[]; actionType: "create_ticket" | "request_refund"; reason: string; amount: string; enabled: boolean };
const blank = (): Draft => ({ name: "", trigger: "shipment.updated", conditions: [{ field: "shipment.status", op: "eq", value: "delayed" }], actionType: "create_ticket", reason: "", amount: "full", enabled: true });

export default function Workflows() {
  const { data, error, loading, reload } = useApi<W[]>("/api/workflows");
  const ex = useApi<E[]>("/api/workflows/executions");
  const canManage = useCan("workflow.manage");
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"all" | "succeeded" | "failed" | "skipped">("all");

  const edit = (w: W) => {
    setErr(null);
    setDraft({
      id: w.id, name: w.name, trigger: w.trigger as Draft["trigger"], enabled: w.enabled,
      conditions: w.conditions.map((c) => ({ field: c.field, op: c.op, value: c.field === "order.amount_minor" ? String(Number(c.value) / 100) : String(c.value) })),
      actionType: w.action.type, reason: w.action.reason ?? "", amount: w.action.type === "request_refund" ? (w.action.amount === "full" ? "full" : String(w.action.amount / 100)) : "full",
    });
  };

  async function save() {
    if (!draft) return;
    setErr(null);
    if (!draft.name.trim()) return setErr("Give the workflow a name.");
    const conditions = draft.conditions.map((c) => ({ field: c.field, op: c.op, value: c.field === "order.amount_minor" ? Math.round(Number(c.value) * 100) : c.value }));
    if (conditions.some((c) => c.field === "order.amount_minor" && !Number.isFinite(c.value as number))) return setErr("Order amount must be a number in rupees.");
    if (draft.actionType === "create_ticket" && !draft.reason.trim()) return setErr("A ticket reason is required.");
    if (draft.actionType === "request_refund" && draft.amount !== "full" && !(Number(draft.amount) > 0)) return setErr("Refund amount must be a positive number or 'full'.");
    const action = draft.actionType === "create_ticket" ? { type: "create_ticket", reason: draft.reason.trim() } : { type: "request_refund", amount: draft.amount === "full" ? "full" : Math.round(Number(draft.amount) * 100), reason: draft.reason || undefined };
    setBusy(true);
    try {
      await api(draft.id ? `/api/workflows/${draft.id}` : "/api/workflows", { method: draft.id ? "PATCH" : "POST", json: { name: draft.name.trim(), trigger: draft.trigger, conditions, action, enabled: draft.enabled } });
      toast("success", draft.name, draft.id ? "Workflow updated" : "Workflow created");
      setDraft(null);
      reload();
    } catch (e) {
      const b = (e as { body?: { details?: { path: string[]; message: string }[] } }).body;
      setErr(b?.details?.map((d) => `${d.path.join(".")}: ${d.message}`).join("; ") || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(w: W) {
    try {
      await api(`/api/workflows/${w.id}`, { method: "PATCH", json: { enabled: !w.enabled } });
      toast("success", w.name, w.enabled ? "Workflow disabled" : "Workflow enabled");
    } catch (e) {
      toast("error", (e as Error).message);
    }
    reload();
  }

  const execs = (ex.data ?? []).filter((e) => outcome === "all" || e.status === outcome);
  const counts = (ex.data ?? []).reduce<Record<string, number>>((m, e) => ((m[e.status] = (m[e.status] ?? 0) + 1), m), {});

  return (
    <div className="anim-in">
      <PageHeader title="Workflow automations" description="When an event arrives and every condition holds, the action runs once for that event. Refund actions always go to manager approval."
        actions={canManage && <Button variant="primary" onClick={() => { setErr(null); setDraft(blank()); }} icon={<Plus className="size-3.5" />}>New workflow</Button>} />

      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <div className="grid gap-3 lg:grid-cols-2">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-48" />)}</div> : !data?.length ? (
        <Card><Empty title="No workflows yet" hint="Automate support tickets or refund requests when payments fail, shipments change or orders are cancelled." icon={<WorkflowIcon className="size-5" />} action={canManage && <Button variant="primary" onClick={() => setDraft(blank())}>Create workflow</Button>} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {data.map((w) => {
            const T = TRIGGERS[w.trigger as keyof typeof TRIGGERS];
            const fails = w.stats.failed ?? 0;
            return (
              <article key={w.id} className={clsx("flex flex-col rounded-card border bg-surface shadow-card transition-colors", w.enabled ? "border-line" : "border-dashed border-line-strong")}>
                <div className="flex items-start justify-between gap-3 px-4 pt-4">
                  <div className="min-w-0">
                    <h3 className={clsx("truncate text-[14px] font-semibold", !w.enabled && "text-fg-2")}>{w.name}</h3>
                    <div className="mt-0.5 text-[12px] text-fg-3">by {w.createdBy} · updated {when(w.updatedAt)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-fg-3">{w.enabled ? "On" : "Off"}</span>
                    <Switch checked={w.enabled} onChange={() => toggle(w)} disabled={!canManage} label={`${w.enabled ? "Disable" : "Enable"} ${w.name}`} />
                  </div>
                </div>
                <ol className="m-4 space-y-0 rounded-lg border border-line bg-subtle/50 text-[13px]">
                  <Step kind="When" icon={<T.icon className="size-3.5" />}>{T.label}</Step>
                  {w.conditions.map((c, i) => <Step key={i} kind={i ? "And" : "If"}><span className="text-fg-2">{fieldLabel(c.field)}</span> {opLabel(c.op)} <span className="font-medium capitalize">{valueLabel(c)}</span></Step>)}
                  <Step kind="Then" icon={w.action.type === "create_ticket" ? <LifeBuoy className="size-3.5" /> : <RotateCcw className="size-3.5" />} last>
                    {w.action.type === "create_ticket" ? <>Create support ticket <span className="text-fg-3">— “{w.action.reason}”</span></> : <>Request refund of <span className="font-medium">{w.action.amount === "full" ? "the remaining captured amount" : inr(w.action.amount)}</span> <Badge tone="warn" dot={false}>needs approval</Badge></>}
                  </Step>
                </ol>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-fg-3">
                    <span><span className="num font-medium text-ok">{w.stats.succeeded ?? 0}</span> succeeded</span>
                    <span className={clsx(fails && "flex items-center gap-1 text-bad")}>{fails > 0 && <AlertTriangle className="size-3" />}<span className="num font-medium">{fails}</span> failed</span>
                    <span><span className="num font-medium">{w.stats.skipped ?? 0}</span> skipped</span>
                  </div>
                  {canManage && <Button size="sm" variant="ghost" onClick={() => edit(w)} icon={<Pencil className="size-3.5" />}>Edit</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Card className="mt-6" title="Execution history" description="Each run records its outcome, including skipped and failed runs" pad={false}
        actions={<Segmented size="sm" value={outcome} onChange={setOutcome} options={[{ value: "all", label: "All", count: ex.data?.length ?? 0 }, { value: "succeeded", label: "Succeeded", count: counts.succeeded ?? 0 }, { value: "failed", label: "Failed", count: counts.failed ?? 0 }, { value: "skipped", label: "Skipped", count: counts.skipped ?? 0 }]} />}>
        {ex.error ? <div className="p-4"><ErrorBox error={ex.error} onRetry={ex.reload} /></div> : !ex.data ? <div className="p-4"><SkeletonBlock className="h-32" /></div> : !execs.length ? <Empty title={outcome === "all" ? "No executions yet" : `No ${outcome} runs`} hint="Workflows run when a webhook arrives or an order is cancelled in the app." icon={<Zap className="size-5" />} /> : (
          <Table head={["When", "Workflow", "Order", "Event", "Outcome", "Detail"]}>
            {execs.map((e) => (
              <tr key={e.id} className={tr + " align-top"}>
                <td className={td + " whitespace-nowrap text-fg-2"}>{when(e.createdAt)}</td>
                <td className={td + " font-medium"}>{e.workflow.name}</td>
                <td className={td}>{e.orderId ? <OrderLink id={e.orderId} /> : "—"}</td>
                <td className={td + " max-w-40 truncate font-mono text-[11px] text-fg-3"} title={e.eventId}>{e.eventId}</td>
                <td className={td}><Badge status={e.status} /></td>
                <td className={td + " text-[12px] text-fg-2"}>{e.detail}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit workflow" : "New workflow"} description="Trigger → conditions (all must match) → action"
        footer={<><Button onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{draft?.id ? "Save changes" : "Create workflow"}</Button></>}>
        {draft && (
          <>
            {err && <ErrorBox error={err} />}
            <Field label="Name"><input data-autofocus className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Delayed high-value shipment → ticket" /></Field>
            <div className="space-y-2">
              <span className="text-[12px] font-medium">When this happens</span>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(TRIGGERS) as Draft["trigger"][]).map((k) => {
                  const T = TRIGGERS[k];
                  return (
                    <button key={k} type="button" onClick={() => setDraft({ ...draft, trigger: k })} aria-pressed={draft.trigger === k}
                      className={clsx("flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left text-[12px] transition-colors", draft.trigger === k ? "border-accent bg-accent-soft/60 text-fg ring-1 ring-accent" : "border-line text-fg-2 hover:border-line-strong")}>
                      <T.icon className={clsx("size-4", draft.trigger === k ? "text-accent" : "text-fg-3")} />{T.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[12px] font-medium">Only if all of these are true</span>
              {draft.conditions.map((c, i) => {
                const upd = (patch: Partial<typeof c>) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const numeric = c.field === "order.amount_minor";
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <select aria-label="Field" className={selectCls} value={c.field} onChange={(e) => upd({ field: e.target.value, op: e.target.value === "order.amount_minor" ? "gt" : "eq", value: e.target.value === "order.amount_minor" ? "5000" : VALUES[e.target.value]?.[0] ?? "" })}>
                      {Object.entries(FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select aria-label="Operator" className={selectCls + " w-36 shrink-0"} value={c.op} onChange={(e) => upd({ op: e.target.value })}>
                      {Object.entries(OPS).filter(([k]) => numeric || k === "eq" || k === "neq").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {VALUES[c.field] ? (
                      <select aria-label="Value" className={selectCls} value={c.value} onChange={(e) => upd({ value: e.target.value })}>{VALUES[c.field].map((v) => <option key={v}>{v}</option>)}</select>
                    ) : (
                      <div className="relative w-full">{numeric && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3">₹</span>}<input aria-label="Value" className={inputCls + (numeric ? " num pl-6" : "")} value={c.value} onChange={(e) => upd({ value: e.target.value })} /></div>
                    )}
                    <Button variant="ghost" size="sm" aria-label="Remove condition" disabled={draft.conditions.length === 1} onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })} icon={<Trash2 className="size-3.5" />} />
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "order.amount_minor", op: "gt", value: "5000" }] })} icon={<Plus className="size-3.5" />}>Add condition</Button>
            </div>
            <div className="space-y-2">
              <span className="text-[12px] font-medium">Then do this</span>
              <div className="grid grid-cols-2 gap-2">
                {([["create_ticket", "Create support ticket", LifeBuoy], ["request_refund", "Request refund", RotateCcw]] as const).map(([k, l, I]) => (
                  <button key={k} type="button" onClick={() => setDraft({ ...draft, actionType: k })} aria-pressed={draft.actionType === k}
                    className={clsx("flex items-center gap-2 rounded-lg border p-2.5 text-[12px] transition-colors", draft.actionType === k ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line text-fg-2 hover:border-line-strong")}>
                    <I className={clsx("size-4", draft.actionType === k ? "text-accent" : "text-fg-3")} />{l}
                  </button>
                ))}
              </div>
              {draft.actionType === "request_refund" && (
                <>
                  <Callout tone="warn">Refund actions only create a request. A manager still approves each one before money moves.</Callout>
                  <Field label="Refund amount (₹)" hint="Type 'full' to request the remaining refundable amount."><input className={inputCls} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></Field>
                </>
              )}
              <Field label={draft.actionType === "create_ticket" ? "Ticket reason" : "Refund reason (optional)"}><textarea className={inputCls + " h-20 resize-none py-2"} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></Field>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
              <span><span className="block text-[13px] font-medium">Enabled</span><span className="text-[12px] text-fg-3">Disabled workflows keep their history but don&apos;t run.</span></span>
              <Switch checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Enabled" />
            </label>
          </>
        )}
      </Sheet>
    </div>
  );
}

function Step({ kind, icon, children, last }: { kind: string; icon?: React.ReactNode; children: React.ReactNode; last?: boolean }) {
  return (
    <li className={clsx("flex items-start gap-3 px-3 py-2", !last && "border-b border-line")}>
      <span className={clsx("mt-px w-10 shrink-0 text-[11px] font-semibold uppercase tracking-[0.05em]", kind === "Then" ? "text-accent" : "text-fg-3")}>{kind}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{icon && <span className="text-fg-3">{icon}</span>}{children}</span>
    </li>
  );
}
