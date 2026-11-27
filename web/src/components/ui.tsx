"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";

export { clsx };

/* ---------- data fetching ---------- */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (res.ok && (init?.method ?? (init?.json !== undefined ? "POST" : "GET")) !== "GET" && typeof window !== "undefined") window.dispatchEvent(new Event("nova:changed"));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data);
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

/* ---------- formatting ---------- */
export function inr(minor: number | null | undefined) {
  if (minor == null) return "—";
  const r = Math.floor(Math.abs(minor) / 100);
  const p = Math.abs(minor) % 100;
  return `${minor < 0 ? "-" : ""}₹${r.toLocaleString("en-IN")}${p ? "." + String(p).padStart(2, "0") : ""}`;
}
export function when(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export const fullDate = (d: string | Date) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/* ---------- primitives ---------- */
const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  gray: "bg-ink-100 text-ink-600 ring-ink-500/15",
};
const STATUS_TONE: Record<string, string> = {
  delivered: "green", captured: "green", succeeded: "green", success: "green", healthy: "green", processed: "green", approved: "green", open: "blue",
  processing: "blue", pending: "gray", pending_approval: "amber", executing: "blue", shipped: "violet", running: "blue",
  delayed: "amber", partial: "amber", degraded: "amber", skipped: "gray", unconfirmed: "amber", ignored: "gray", duplicate: "gray", info: "gray",
  cancelled: "gray", rejected: "red", failed: "red", failure: "red", denied: "red", unknown: "gray",
};
export function Badge({ status, children, tone }: { status?: string; children?: ReactNode; tone?: string }) {
  const t = tone ?? STATUS_TONE[status ?? ""] ?? "gray";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap", TONES[t])}>
      <span className={clsx("size-1.5 rounded-full", { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", blue: "bg-sky-500", violet: "bg-violet-500", gray: "bg-ink-400" }[t])} />
      {children ?? (status ?? "").replace(/_/g, " ")}
    </span>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("rounded-lg border border-ink-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-ink-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Button({
  children, onClick, variant = "secondary", disabled, loading, type = "button", title, size = "md",
}: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; loading?: boolean; type?: "button" | "submit"; title?: string; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        {
          primary: "bg-ink-900 text-white hover:bg-ink-700",
          secondary: "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
          danger: "bg-rose-600 text-white hover:bg-rose-700",
          ghost: "text-ink-600 hover:bg-ink-100",
        }[variant],
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export const inputCls = "h-8 w-full rounded-md border border-ink-200 bg-white px-2.5 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-500">{hint}</span>}
    </label>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-7 animate-pulse rounded bg-ink-100" style={{ width: `${90 - i * 7}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <div className="mb-1 text-ink-300">{icon ?? <Inbox className="size-6" />}</div>
      <p className="text-[13px] font-medium text-ink-700">{title}</p>
      {hint && <p className="max-w-sm text-[12px] text-ink-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{error}</div>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/60 text-[11px] uppercase tracking-wide text-ink-500">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}
export const td = "px-3 py-2 align-middle";

/* ---------- modal ---------- */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} className="w-full max-w-md rounded-lg bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-400 hover:bg-ink-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- toasts ---------- */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx("rounded-md border px-3 py-2 text-[12px] shadow-lg", {
              success: "border-emerald-200 bg-white text-emerald-800",
              error: "border-rose-200 bg-white text-rose-800",
              info: "border-ink-200 bg-white text-ink-800",
            }[t.kind])}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
