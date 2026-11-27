"use client";
/**
 * NovaCommerce UI kit. All visual primitives live here so pages stay consistent.
 * Colours come from semantic tokens in globals.css (canvas/surface/line/fg/accent/ok/warn/bad...).
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, Loader2, X, XCircle } from "lucide-react";

export { clsx };

/* ───────────────────────── data ───────────────────────── */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const method = init?.method ?? (init?.json !== undefined ? "POST" : "GET");
  const res = await fetch(path, {
    ...init,
    method,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) window.location.href = "/login";
  if (res.ok && method !== "GET" && typeof window !== "undefined") window.dispatchEvent(new Event("nova:changed"));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`, data);
  return data as T;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load };
}

/* ───────────────────────── formatting ───────────────────────── */
export function inr(minor: number | null | undefined) {
  if (minor == null) return "—";
  const r = Math.floor(Math.abs(minor) / 100);
  const p = Math.abs(minor) % 100;
  return `${minor < 0 ? "-" : ""}₹${r.toLocaleString("en-IN")}${p ? "." + String(p).padStart(2, "0") : ""}`;
}
/** Compact Indian notation: ₹7.46L, ₹1.2Cr */
export function inrCompact(minor: number | null | undefined) {
  if (minor == null) return "—";
  const r = minor / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  if (Math.abs(r) >= 1e3) return `₹${(r / 1e3).toFixed(1)}K`;
  return inr(minor);
}
export function when(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export const fullDate = (d: string | Date) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const shortDate = (d: string | Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/* ───────────────────────── status ───────────────────────── */
export type Tone = "ok" | "warn" | "bad" | "info" | "violet" | "neutral" | "accent";
const STATUS_TONE: Record<string, Tone> = {
  delivered: "ok", captured: "ok", succeeded: "ok", success: "ok", healthy: "ok", processed: "ok", approved: "ok", open: "info",
  processing: "info", executing: "info", running: "info", shipped: "violet",
  pending: "neutral", pending_approval: "warn", delayed: "warn", partial: "warn", degraded: "warn", unconfirmed: "warn",
  skipped: "neutral", ignored: "neutral", duplicate: "neutral", info: "neutral", cancelled: "neutral", unknown: "neutral",
  rejected: "bad", failed: "bad", failure: "bad", denied: "bad",
};
export const toneOf = (status?: string | null): Tone => STATUS_TONE[status ?? ""] ?? "neutral";
export const TONE_HEX: Record<Tone, string> = {
  ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--info)", violet: "var(--violet)", neutral: "var(--neutral)", accent: "var(--accent)",
};
const BADGE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  neutral: "bg-neutral-soft text-fg-2",
  accent: "bg-accent-soft text-accent",
};
const DOT: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", violet: "bg-violet", neutral: "bg-fg-3", accent: "bg-accent" };

export function Badge({ status, children, tone, dot = true, className }: { status?: string | null; children?: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  const t = tone ?? toneOf(status);
  return (
    <span className={clsx("inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none", BADGE[t], className)}>
      {dot && <span className={clsx("size-1.5 rounded-full", DOT[t])} />}
      {children ?? titleCase(status ?? "")}
    </span>
  );
}
export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className={clsx("absolute inline-flex size-full animate-ping rounded-full opacity-50", DOT[tone])} />}
      <span className={clsx("relative inline-flex size-2 rounded-full", DOT[tone])} />
    </span>
  );
}

/* ───────────────────────── layout ───────────────────────── */
export function Card({ title, description, actions, children, className, pad = true, footer }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; footer?: ReactNode;
}) {
  return (
    <section className={clsx("flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-semibold text-fg">{title}</h2>}
            {description && <p className="truncate text-[12px] text-fg-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={clsx("min-h-0 flex-1", pad && "p-4")}>{children}</div>
      {footer && <footer className="border-t border-line px-4 py-2.5">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description && <div className="mt-1 text-[13px] text-fg-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-[12px] text-fg-3">{k}</dt>
          <dd className="min-w-0 truncate text-right text-[13px] font-medium text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kpi({ label, value, context, tone, icon, href, onClick }: {
  label: string; value: ReactNode; context?: ReactNode; tone?: "bad" | "warn" | "ok"; icon?: ReactNode; href?: string; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-fg-2">{label}</span>
        {icon && <span className={clsx("grid size-6 place-items-center rounded-md", tone ? BADGE[tone] : "bg-subtle text-fg-3")}>{icon}</span>}
      </div>
      <div className={clsx("num mt-2 text-[24px] font-semibold leading-none tracking-[-0.02em]", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg")}>{value}</div>
      {context && <div className="mt-1.5 truncate text-[12px] text-fg-3">{context}</div>}
    </>
  );
  const cls = "block rounded-card border border-line bg-surface px-4 py-3.5 shadow-card transition-colors";
  if (href) return <a href={href} className={clsx(cls, "hover:border-line-strong hover:bg-subtle/40")}>{inner}</a>;
  if (onClick) return <button onClick={onClick} className={clsx(cls, "text-left hover:border-line-strong")}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/* ───────────────────────── controls ───────────────────────── */
type BtnProps = {
  children?: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "accent-soft"; disabled?: boolean; loading?: boolean;
  type?: "button" | "submit"; title?: string; size?: "xs" | "sm" | "md"; icon?: ReactNode; className?: string; "aria-label"?: string;
};
export function Button({ children, onClick, variant = "secondary", disabled, loading, type = "button", title, size = "md", icon, className, ...rest }: BtnProps) {
  return (
    <button
      type={type}
      title={title}
      aria-label={rest["aria-label"]}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
        size === "xs" ? "h-6 px-2 text-[12px]" : size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        !children && (size === "xs" ? "w-6 px-0" : size === "sm" ? "w-7 px-0" : "w-8 px-0"),
        {
          primary: "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-accent-hover",
          secondary: "border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-subtle",
          ghost: "text-fg-2 hover:bg-subtle hover:text-fg",
          danger: "bg-bad text-white hover:brightness-95",
          "accent-soft": "bg-accent-soft text-accent hover:brightness-[0.97]",
        }[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export const inputCls =
  "h-8 w-full rounded-ctl border border-line bg-surface px-2.5 text-[13px] text-fg shadow-card placeholder:text-fg-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-50";
export const selectCls = inputCls + " appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%23858b99%22 stroke-width=%221.5%22><path d=%22M3 4.5l3 3 3-3%22/></svg>')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-fg">{label}</span>
      {children}
      {error ? <span className="block text-[11px] text-bad">{error}</span> : hint && <span className="block text-[11px] text-fg-3">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40", checked ? "bg-accent" : "bg-line-strong")}
    >
      <span className={clsx("inline-block size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className="inline-flex rounded-ctl border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors",
            size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12px]",
            value === o.value ? "bg-surface text-fg shadow-card" : "text-fg-2 hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={clsx("num rounded px-1 text-[11px]", value === o.value ? "bg-subtle text-fg-2" : "text-fg-3")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── feedback ───────────────────────── */
export function Skeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("space-y-2.5", className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${92 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  );
}
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-card bg-muted", className)} />;
}

export function Empty({ title, hint, icon, action }: { title: string; hint?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-subtle text-fg-3">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[12px] text-fg-3">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry, title }: { error: string; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-card border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[13px] text-fg">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        <div className={title ? "text-fg-2" : ""}>{error}</div>
      </div>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
export function Callout({ tone = "info", children, icon }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode; icon?: ReactNode }) {
  const Icon = tone === "bad" || tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={clsx("flex items-start gap-2.5 rounded-card border px-3.5 py-2.5 text-[13px] text-fg", {
      info: "border-info/20 bg-info-soft", warn: "border-warn/25 bg-warn-soft", bad: "border-bad/25 bg-bad-soft", ok: "border-ok/25 bg-ok-soft",
    }[tone])}>
      <span className={clsx("mt-0.5 shrink-0", { info: "text-info", warn: "text-warn", bad: "text-bad", ok: "text-ok" }[tone])}>{icon ?? <Icon className="size-4" />}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ───────────────────────── table ───────────────────────── */
export type Col = { label: ReactNode; align?: "left" | "right"; className?: string };
export function Table({ head, children, dense }: { head: (ReactNode | Col)[]; children: ReactNode; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => {
              const c: Col = h && typeof h === "object" && "label" in (h as object) ? (h as Col) : { label: h as ReactNode };
              return (
                <th key={i} className={clsx("sticky top-0 whitespace-nowrap bg-subtle/60 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-fg-3 first:pl-4 last:pr-4", c.align === "right" && "text-right", c.className)}>
                  {c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={clsx("divide-y divide-line", dense && "[&_td]:py-1.5")}>{children}</tbody>
      </table>
    </div>
  );
}
/** Standard cell padding; first/last columns get extra inset to align with card padding. */
export const td = "px-3 py-2.5 align-middle first:pl-4 last:pr-4";
export const tr = "transition-colors hover:bg-subtle/60";

export function Pagination({ page, pages, total, onPage, label = "results" }: { page: number; pages: number; total: number; onPage: (p: number) => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12px] text-fg-3">
      <span className="num">{total.toLocaleString("en-IN")} {label} · page {page} of {pages}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="size-3.5" />}>Previous</Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight className="size-3.5" /></Button>
      </div>
    </div>
  );
}

export function OrderLink({ id, className }: { id: string; className?: string }) {
  return (
    <a href={`/orders/${id}`} onClick={(e) => e.stopPropagation()} className={clsx("font-mono text-[12px] font-medium text-fg underline-offset-2 hover:text-accent hover:underline", className)}>
      {id}
    </a>
  );
}

/* ───────────────────────── overlays ───────────────────────── */
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    setTimeout(() => (focusables().find((f) => f.dataset.autofocus !== undefined) ?? focusables()[1] ?? focusables()[0])?.focus(), 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  const ref = useFocusTrap(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal aria-labelledby={id} onMouseDown={(e) => e.stopPropagation()}
        className={clsx("anim-pop w-full rounded-t-xl border border-line bg-surface shadow-pop sm:rounded-xl", { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl" }[size])}>
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div>
            <h3 id={id} className="text-[15px] font-semibold text-fg">{title}</h3>
            {description && <p className="mt-1 text-[13px] text-fg-2">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" icon={<X className="size-4" />} />
        </div>
        {children && <div className="space-y-3.5 px-5 py-3">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-subtle/50 px-5 py-3 sm:rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[1px]" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal aria-label={typeof title === "string" ? title : "Panel"} onMouseDown={(e) => e.stopPropagation()}
        className="anim-sheet flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold">{title}</h3>
            {description && <p className="mt-0.5 text-[12px] text-fg-3">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" icon={<X className="size-4" />} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Minimal accessible dropdown menu. */
export function Menu({ trigger, items, align = "right", width = "w-48" }: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  items: ({ label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string } | "divider" | { header: ReactNode })[];
  align?: "left" | "right"; width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? []);
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    setTimeout(() => ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([disabled])")?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div role="menu" className={clsx("anim-pop absolute z-40 mt-1.5 rounded-lg border border-line bg-surface p-1 shadow-pop", width, align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : "header" in it ? (
              <div key={i} className="px-2 pb-1 pt-1.5">{it.header}</div>
            ) : (
              <button key={i} role="menuitem" disabled={it.disabled} title={it.hint}
                onClick={() => { setOpen(false); it.onSelect(); }}
                className={clsx("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none transition-colors disabled:opacity-40 focus:bg-subtle hover:bg-subtle", it.danger ? "text-bad" : "text-fg")}>
                {it.icon && <span className="text-fg-3 [&>svg]:size-4">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── toasts ───────────────────────── */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string; title?: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string, title?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = (id: number) => setItems((x) => x.filter((t) => t.id !== id));
  const push = useCallback((kind: Toast["kind"], text: string, title?: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, kind, text, title }]);
    setTimeout(() => dismiss(id), kind === "error" ? 8000 : 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="anim-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 shadow-pop">
            {t.kind === "success" ? <CheckCircle2 className="mt-px size-4 shrink-0 text-ok" /> : t.kind === "error" ? <XCircle className="mt-px size-4 shrink-0 text-bad" /> : <Info className="mt-px size-4 shrink-0 text-info" />}
            <div className="min-w-0 flex-1 text-[13px]">
              {t.title && <div className="font-medium text-fg">{t.title}</div>}
              <div className={t.title ? "text-fg-2" : "text-fg"}>{t.text}</div>
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-0.5 text-fg-3 hover:bg-subtle hover:text-fg"><X className="size-3.5" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────────────────────── charts ───────────────────────── */
export function ChartTooltip({ active, payload, label, money }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      {label && <div className="mb-1 font-medium capitalize text-fg">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-fg-2">
          <span className="size-2 rounded-sm" style={{ background: p.color ?? (p.payload?.fill as string) }} />
          <span className="capitalize">{p.name}</span>
          <span className="num ml-auto pl-4 font-medium text-fg">{money ? inr(p.value ?? 0) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── audit wording ───────────────────────── */
const ACTIONS: Record<string, string> = {
  "auth.login": "Signed in",
  "order.cancel": "Cancellation",
  "refund.request": "Refund requested",
  "refund.approve": "Refund approved",
  "refund.reject": "Refund rejected",
  "refund.execute": "Refund executed",
  "ticket.create": "Support ticket",
  "workflow.create": "Workflow created",
  "workflow.update": "Workflow edited",
  "workflow.enable": "Workflow enabled",
  "workflow.disable": "Workflow disabled",
  "workflow.execute": "Workflow run",
  "integration.sync": "Synchronization",
  "webhook.receive": "Webhook received",
  "webhook.payment.failed": "Webhook · payment failed",
  "webhook.shipment.updated": "Webhook · shipment updated",
  "webhook.order.cancelled": "Webhook · order cancelled",
  "assistant.query": "Nova Intelligence query",
};
/** Human label for an audit action, e.g. "refund.execute" → "Refund executed", "denied:order.cancel" → "Permission denied · order.cancel". */
export function actionLabel(action: string) {
  if (action.startsWith("denied:")) return `Permission denied · ${action.slice(7)}`;
  return ACTIONS[action] ?? action;
}
