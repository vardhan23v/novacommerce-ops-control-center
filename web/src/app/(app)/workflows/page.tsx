"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, Badge, Button, Card, Empty, ErrorBox, Field, inputCls, inr, Modal, PageHeader, Skeleton, Table, td, useApi, useToast, when } from "@/components/ui";
import { useCan } from "@/components/session";

type Cond = { field: string; op: string; value: string | number };
type Action = { type: "create_ticket"; reason: string } | { type: "request_refund"; amount: "full" | number; reason?: string };
type W = { id: string; name: string; trigger: string; conditions: Cond[]; action: Action; enabled: boolean; createdBy: string; updatedAt: string; stats: Record<string, number> };
type E = { id: string; status: string; detail: string | null; orderId: string | null; eventId: string; createdAt: string; workflow: { name: string } };

const TRIGGERS = { "payment.failed": "Payment failure", "shipment.updated": "Shipment update", "order.cancelled": "Order cancellation" } as const;
const FIELDS = { "order.amount_minor": "Order amount (₹)", "order.status": "Order status", "payment.status": "Payment status", "shipment.status": "Shipment status", "order.channel": "Order channel" } as const;
const OPS = { eq: "equals", neq: "is not", gt: ">", gte: "≥", lt: "<", lte: "≤" } as const;
const VALUES: Record<string, string[]> = {
  "order.status": ["processing", "shipped", "delivered", "cancelled"],
  "payment.status": ["captured", "failed"],
  "shipment.status": ["pending", "shipped", "delayed", "delivered", "cancelled"],
};

function describeCond(c: Cond) {
  const v = c.field === "order.amount_minor" ? inr(Number(c.value)) : String(c.value);
  return `${FIELDS[c.field as keyof typeof FIELDS] ?? c.field} ${OPS[c.op as keyof typeof OPS] ?? c.op} ${v}`;
}
function describeAction(a: Action) {
  return a.type === "create_ticket" ? `Create support ticket: “${a.reason}”` : `Request refund (${a.amount === "full" ? "remaining captured amount" : inr(a.amount)}) → manager approval`;
}

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

  const edit = (w: W) =>
    setDraft({
      id: w.id, name: w.name, trigger: w.trigger as Draft["trigger"], enabled: w.enabled,
      conditions: w.conditions.map((c) => ({ field: c.field, op: c.op, value: c.field === "order.amount_minor" ? String(Number(c.value) / 100) : String(c.value) })),
      actionType: w.action.type, reason: w.action.reason ?? "", amount: w.action.type === "request_refund" ? (w.action.amount === "full" ? "full" : String(w.action.amount / 100)) : "full",
    });

  async function save() {
    if (!draft) return;
    setErr(null);
    const conditions = draft.conditions.map((c) => ({ field: c.field, op: c.op, value: c.field === "order.amount_minor" ? Math.round(Number(c.value) * 100) : c.value }));
    if (conditions.some((c) => c.field === "order.amount_minor" && !Number.isFinite(c.value as number))) return setErr("Order amount must be a number");
    const action = draft.actionType === "create_ticket" ? { type: "create_ticket", reason: draft.reason } : { type: "request_refund", amount: draft.amount === "full" ? "full" : Math.round(Number(draft.amount) * 100), reason: draft.reason || undefined };
    const payload = { name: draft.name, trigger: draft.trigger, conditions, action, enabled: draft.enabled };
    setBusy(true);
    try {
      await api(draft.id ? `/api/workflows/${draft.id}` : "/api/workflows", { method: draft.id ? "PATCH" : "POST", json: payload });
      toast("success", draft.id ? "Workflow updated" : "Workflow created");
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
      toast("success", `${w.name} ${w.enabled ? "disabled" : "enabled"}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
    reload();
  }

  return (
    <>
      <PageHeader title="Workflow automations" subtitle="When an event arrives and every condition holds, the action runs once for that event."
        actions={canManage && <Button variant="primary" onClick={() => setDraft(blank())}><Plus className="size-3.5" />New workflow</Button>} />
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Skeleton /> : !data?.length ? <Card><Empty title="No workflows yet" hint="Create one to automate tickets or refund requests." /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((w) => (
            <Card key={w.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><h3 className="truncate font-semibold">{w.name}</h3>{w.enabled ? <Badge tone="green">enabled</Badge> : <Badge tone="gray">disabled</Badge>}</div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    <div><span className="inline-block w-12 text-[10px] font-semibold uppercase text-ink-400">When</span>{TRIGGERS[w.trigger as keyof typeof TRIGGERS]}</div>
                    {w.conditions.map((c, i) => <div key={i}><span className="inline-block w-12 text-[10px] font-semibold uppercase text-ink-400">{i ? "and" : "if"}</span>{describeCond(c)}</div>)}
                    <div><span className="inline-block w-12 text-[10px] font-semibold uppercase text-ink-400">Then</span>{describeAction(w.action)}</div>
                  </div>
                  <div className="mt-2 text-[11px] text-ink-500">{w.stats.succeeded ?? 0} succeeded · {w.stats.failed ?? 0} failed · {w.stats.skipped ?? 0} skipped · updated {when(w.updatedAt)}</div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" onClick={() => toggle(w)}>{w.enabled ? "Disable" : "Enable"}</Button>
                    <Button size="sm" onClick={() => edit(w)} title="Edit"><Pencil className="size-3.5" /></Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card title="Execution history" className="mt-4" pad={false} actions={<Button size="sm" variant="ghost" onClick={ex.reload}>Refresh</Button>}>
        {ex.error ? <div className="p-3"><ErrorBox error={ex.error} /></div> : !ex.data ? <div className="p-4"><Skeleton /></div> : !ex.data.length ? <Empty title="No executions yet" hint="Send a webhook (see README) or cancel an order to trigger workflows." /> : (
          <Table head={["When", "Workflow", "Order", "Event", "Outcome", "Detail"]}>
            {ex.data.map((e) => (
              <tr key={e.id}>
                <td className={td + " whitespace-nowrap text-ink-500"}>{when(e.createdAt)}</td>
                <td className={td}>{e.workflow.name}</td>
                <td className={td + " font-mono text-[12px]"}>{e.orderId}</td>
                <td className={td + " font-mono text-[11px] text-ink-500"}>{e.eventId}</td>
                <td className={td}><Badge status={e.status} /></td>
                <td className={td + " text-[12px] text-ink-600"}>{e.detail}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit workflow" : "New workflow"}
        footer={<><Button onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save workflow</Button></>}>
        {draft && (
          <>
            {err && <ErrorBox error={err} />}
            <Field label="Name"><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Delayed high-value shipment → ticket" /></Field>
            <Field label="Trigger">
              <select className={inputCls} value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value as Draft["trigger"] })}>
                {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-ink-700">Conditions (all must match)</span>
              {draft.conditions.map((c, i) => {
                const upd = (patch: Partial<typeof c>) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const numeric = c.field === "order.amount_minor";
                return (
                  <div key={i} className="flex gap-1.5">
                    <select aria-label="Field" className={inputCls} value={c.field} onChange={(e) => upd({ field: e.target.value, op: "eq", value: e.target.value === "order.amount_minor" ? "5000" : VALUES[e.target.value]?.[0] ?? "" })}>
                      {Object.entries(FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select aria-label="Operator" className={inputCls + " w-24"} value={c.op} onChange={(e) => upd({ op: e.target.value })}>
                      {Object.entries(OPS).filter(([k]) => numeric || k === "eq" || k === "neq").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {VALUES[c.field] ? (
                      <select aria-label="Value" className={inputCls} value={c.value} onChange={(e) => upd({ value: e.target.value })}>{VALUES[c.field].map((v) => <option key={v}>{v}</option>)}</select>
                    ) : (
                      <input aria-label="Value" className={inputCls} value={c.value} onChange={(e) => upd({ value: e.target.value })} placeholder={numeric ? "₹" : ""} />
                    )}
                    <button aria-label="Remove condition" disabled={draft.conditions.length === 1} className="rounded p-1.5 text-ink-400 hover:bg-ink-100 disabled:opacity-30" onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "order.amount_minor", op: "gt", value: "5000" }] })}><Plus className="size-3.5" />Add condition</Button>
            </div>
            <Field label="Action">
              <select className={inputCls} value={draft.actionType} onChange={(e) => setDraft({ ...draft, actionType: e.target.value as Draft["actionType"] })}>
                <option value="create_ticket">Create support ticket</option>
                <option value="request_refund">Request refund (needs manager approval)</option>
              </select>
            </Field>
            {draft.actionType === "request_refund" && (
              <Field label="Refund amount (₹)" hint="Type 'full' to request the remaining captured amount.">
                <input className={inputCls} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </Field>
            )}
            <Field label={draft.actionType === "create_ticket" ? "Ticket reason" : "Refund reason (optional)"}>
              <input className={inputCls} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Enabled</label>
          </>
        )}
      </Modal>
    </>
  );
}
