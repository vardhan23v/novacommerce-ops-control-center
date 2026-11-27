"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, Bell, Boxes, ChevronsLeft, ChevronsRight, CreditCard, LayoutDashboard, LogOut, PlugZap, Search, ShieldCheck, Sparkles, Truck, Workflow,
} from "lucide-react";
import { SessionProvider, type Me } from "./session";
import { api, clsx, ToastProvider } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Boxes },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/shipments", label: "Shipments", icon: Truck },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: true },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/integrations", label: "Integrations", icon: PlugZap },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/assistant", label: "Nova Intelligence", icon: Sparkles },
];

export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () => api<unknown[]>("/api/approvals?status=pending").then((a) => setPending(a.length)).catch(() => {});
    load();
    window.addEventListener("nova:changed", load);
    return () => window.removeEventListener("nova:changed", load);
  }, [path]);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <SessionProvider value={me}>
      <ToastProvider>
        <div className="flex min-h-screen">
          <aside className={clsx("sticky top-0 flex h-screen shrink-0 flex-col bg-ink-900 text-ink-300 transition-all", collapsed ? "w-14" : "w-56")}>
            <div className="flex h-12 items-center gap-2 border-b border-white/5 px-3">
              <div className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-500 text-[12px] font-bold text-white">N</div>
              {!collapsed && (
                <div className="leading-tight">
                  <div className="text-[13px] font-semibold text-white">NovaCommerce</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-400">Operations</div>
                </div>
              )}
            </div>
            <nav className="flex-1 space-y-0.5 p-2">
              {NAV.map((n) => {
                const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={n.label}
                    className={clsx("flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition", active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white")}
                  >
                    <n.icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                    {!collapsed && n.badge && pending > 0 && <span className="rounded bg-amber-400/90 px-1.5 text-[10px] font-semibold text-ink-900">{pending}</span>}
                  </Link>
                );
              })}
            </nav>
            <button onClick={() => setCollapsed(!collapsed)} className="m-2 flex h-8 items-center justify-center rounded-md text-ink-400 hover:bg-white/5" aria-label="Toggle sidebar">
              {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            </button>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-ink-200 bg-white/90 px-5 backdrop-blur">
              <form
                className="relative max-w-sm flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = q.trim();
                  if (!v) return;
                  router.push(/^NC-\d+$/i.test(v) ? `/orders/${v.toUpperCase()}` : `/orders?q=${encodeURIComponent(v)}`);
                }}
              >
                <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-ink-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to order (NC-1004) or search customer…" className="h-8 w-full rounded-md border border-ink-200 bg-ink-50 pl-8 pr-2 text-[13px] focus:border-accent-500 focus:bg-white focus:outline-none" />
              </form>
              <div className="flex-1" />
              <Link href="/approvals" className="relative rounded-md p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Pending approvals">
                <Bell className="size-4" />
                {pending > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500" />}
              </Link>
              <div className="flex items-center gap-2 border-l border-ink-200 pl-3">
                <div className="grid size-7 place-items-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-700">{me.name.split(" ").map((s) => s[0]).join("")}</div>
                <div className="hidden leading-tight sm:block">
                  <div className="text-[12px] font-medium text-ink-800">{me.name}</div>
                  <div className="text-[11px] capitalize text-ink-500">{me.role}</div>
                </div>
                <button onClick={logout} className="ml-1 rounded-md p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Sign out" title="Sign out">
                  <LogOut className="size-4" />
                </button>
              </div>
            </header>
            {me.role === "viewer" && <div className="border-b border-sky-200 bg-sky-50 px-5 py-1.5 text-[12px] text-sky-800">Read-only access: you can investigate but not change orders, refunds or workflows.</div>}
            <main className="mx-auto w-full max-w-[1400px] flex-1 p-5">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
