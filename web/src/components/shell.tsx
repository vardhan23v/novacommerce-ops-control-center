"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity, Bell, Boxes, ChevronRight, CreditCard, LayoutGrid, LogOut, Menu as MenuIcon, Monitor, Moon, PanelLeftClose, PanelLeftOpen,
  PlugZap, Search, Settings, ShieldCheck, Sparkles, Sun, Truck, Workflow, X,
} from "lucide-react";
import { SessionProvider, type Me } from "./session";
import { api, Badge, clsx, Menu, ToastProvider, when } from "./ui";
import { useTheme } from "./theme";

type NavItem = { href: string; label: string; icon: typeof Boxes; badge?: "approvals" };
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Overview", icon: LayoutGrid }] },
  { group: "Operate", items: [
    { href: "/orders", label: "Orders", icon: Boxes },
    { href: "/payments", label: "Payments", icon: CreditCard },
    { href: "/shipments", label: "Shipments", icon: Truck },
  ] },
  { group: "Automate", items: [
    { href: "/workflows", label: "Workflows", icon: Workflow },
    { href: "/approvals", label: "Approvals", icon: ShieldCheck, badge: "approvals" },
  ] },
  { group: "Monitor", items: [
    { href: "/integrations", label: "Integrations", icon: PlugZap },
    { href: "/activity", label: "Activity", icon: Activity },
  ] },
  { group: "Intelligence", items: [{ href: "/assistant", label: "Nova Intelligence", icon: Sparkles }] },
];
const LABELS: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.href.slice(1), i.label]));
LABELS.settings = "Settings";

type Notice = { id: string; title: string; body: string; href: string; at: string; tone: "warn" | "bad" };

export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seen, setSeen] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    setCollapsed(localStorage.getItem("nova-sidebar") === "collapsed");
    setSeen(localStorage.getItem("nova-notices-seen"));
  }, []);
  useEffect(() => setMobileOpen(false), [path]);

  useEffect(() => {
    const load = async () => {
      try {
        const [approvals, failures] = await Promise.all([
          api<{ id: string; createdAt: string; refund: { orderId: string; amountMinor: number; requestedBy: string } }[]>("/api/approvals?status=pending"),
          api<{ items: { id: string; action: string; entityId: string | null; actor: string; createdAt: string; details: { error?: string; reason?: string } | null }[] }>("/api/audit?outcome=failure"),
        ]);
        setPending(approvals.length);
        const n: Notice[] = [
          ...approvals.map((a) => ({ id: a.id, tone: "warn" as const, title: `Refund awaiting approval · ${a.refund.orderId}`, body: `₹${(a.refund.amountMinor / 100).toLocaleString("en-IN")} requested by ${a.refund.requestedBy}`, href: "/approvals", at: a.createdAt })),
          ...failures.items.slice(0, 8).map((f) => ({ id: f.id, tone: "bad" as const, title: `${f.action} failed${f.entityId ? ` · ${f.entityId}` : ""}`, body: f.details?.error ?? f.details?.reason ?? `by ${f.actor}`, href: f.entityId?.startsWith("NC-") ? `/orders/${f.entityId}` : "/activity", at: f.createdAt })),
        ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
        setNotices(n.slice(0, 10));
      } catch {}
    };
    load();
    window.addEventListener("nova:changed", load);
    return () => window.removeEventListener("nova:changed", load);
  }, [path]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("nova-sidebar", next ? "collapsed" : "open");
  };
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const unread = notices.filter((n) => !seen || new Date(n.at) > new Date(seen)).length;
  const initials = me.name.split(" ").map((s) => s[0]).join("").slice(0, 2);

  const crumbs = (() => {
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return [{ label: "Overview", href: "/" }];
    return parts.map((p, i) => ({ label: LABELS[p] ?? (p.startsWith("NC-") ? p : decodeURIComponent(p)), href: "/" + parts.slice(0, i + 1).join("/") }));
  })();

  const sidebar = (mobile: boolean) => {
    const c = collapsed && !mobile;
    return (
      <div className="flex h-full flex-col">
        <div className={clsx("flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line", c ? "justify-center px-0" : "px-4")}>
          <Logo />
          {!c && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13px] font-semibold tracking-tight text-fg">NovaCommerce</div>
              <div className="text-[11px] text-fg-3">Operations</div>
            </div>
          )}
          {mobile && <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 text-fg-3 hover:bg-subtle"><X className="size-4" /></button>}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3" aria-label="Main">
          {NAV.map((g, gi) => (
            <div key={gi}>
              {g.group && !c && <div className="mb-1 px-2 text-[11px] font-medium text-fg-3">{g.group}</div>}
              {g.group && c && gi > 0 && <div className="mx-2 mb-2 h-px bg-line" />}
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
                  const count = n.badge === "approvals" ? pending : 0;
                  return (
                    <li key={n.href}>
                      <Link href={n.href} title={c ? n.label : undefined} aria-current={active ? "page" : undefined}
                        className={clsx("group relative flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors",
                          c ? "justify-center px-0" : "px-2",
                          active ? "bg-surface font-medium text-fg shadow-card ring-1 ring-line" : "text-fg-2 hover:bg-subtle hover:text-fg")}>
                        <n.icon className={clsx("size-4 shrink-0", active ? (n.href === "/assistant" ? "text-violet" : "text-accent") : "text-fg-3 group-hover:text-fg-2")} />
                        {!c && <span className="flex-1 truncate">{n.label}</span>}
                        {count > 0 && (c ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warn" /> : <span className="num rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">{count}</span>)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-line p-2.5">
          <Link href="/settings" title={c ? "Settings" : undefined}
            className={clsx("flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors", c ? "justify-center" : "px-2",
              path.startsWith("/settings") ? "bg-surface font-medium text-fg shadow-card ring-1 ring-line" : "text-fg-2 hover:bg-subtle hover:text-fg")}>
            <Settings className={clsx("size-4", path.startsWith("/settings") ? "text-accent" : "text-fg-3")} />{!c && "Settings"}
          </Link>
          <div className={clsx("flex items-center gap-2.5 rounded-md py-1.5", c ? "justify-center" : "px-2")}>
            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{initials}</div>
            {!c && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12px] font-medium text-fg">{me.name}</div>
                <div className="truncate text-[11px] capitalize text-fg-3">{me.role}</div>
              </div>
            )}
          </div>
          {!mobile && (
            <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={clsx("flex h-8 w-full items-center gap-2.5 rounded-md text-[12px] text-fg-3 transition-colors hover:bg-subtle hover:text-fg", c ? "justify-center" : "px-2")}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" />Collapse</>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <SessionProvider value={me}>
      <ToastProvider>
        <div className="flex min-h-screen">
          <aside className={clsx("sticky top-0 hidden h-screen shrink-0 border-r border-line bg-sidebar transition-[width] duration-200 lg:block", collapsed ? "w-[60px]" : "w-[240px]")}>{sidebar(false)}</aside>
          {mobileOpen && (
            <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onMouseDown={() => setMobileOpen(false)}>
              <aside className="anim-in h-full w-[260px] border-r border-line bg-sidebar" onMouseDown={(e) => e.stopPropagation()}>{sidebar(true)}</aside>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
              <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-md p-1.5 text-fg-2 hover:bg-subtle lg:hidden"><MenuIcon className="size-4" /></button>
              <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[13px] md:flex">
                {crumbs.map((c, i) => (
                  <span key={c.href} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-fg-3" />}
                    {i === crumbs.length - 1 ? <span className={clsx("truncate font-medium text-fg", c.label.startsWith("NC-") && "font-mono text-[12px]")}>{c.label}</span> : <Link href={c.href} className="truncate text-fg-3 hover:text-fg">{c.label}</Link>}
                  </span>
                ))}
              </nav>
              <div className="flex-1" />
              <GlobalSearch />
              <Menu
                width="w-[340px]"
                trigger={(p) => (
                  <button {...p} onClick={() => { p.onClick(); const now = new Date().toISOString(); setSeen(now); localStorage.setItem("nova-notices-seen", now); }}
                    aria-label={`Notifications${unread ? ` (${unread} new)` : ""}`} className="relative rounded-md p-2 text-fg-2 transition-colors hover:bg-subtle hover:text-fg">
                    <Bell className="size-4" />
                    {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-canvas bg-bad" />}
                  </button>
                )}
                items={[
                  { header: <div className="flex items-center justify-between"><span className="text-[12px] font-semibold text-fg">Notifications</span><span className="text-[11px] text-fg-3">approvals & failures</span></div> },
                  ...(notices.length
                    ? notices.map((n) => ({
                        label: (
                          <span className="block min-w-0 py-1">
                            <span className="flex items-center gap-1.5"><span className={clsx("size-1.5 shrink-0 rounded-full", n.tone === "bad" ? "bg-bad" : "bg-warn")} /><span className="truncate text-[12px] font-medium">{n.title}</span></span>
                            <span className="block truncate pl-3 text-[11px] text-fg-3">{n.body} · {when(n.at)}</span>
                          </span>
                        ),
                        onSelect: () => router.push(n.href),
                      }))
                    : [{ header: <p className="py-4 text-center text-[12px] text-fg-3">You&apos;re all caught up</p> }]),
                ]}
              />
              <Menu
                width="w-56"
                trigger={(p) => (
                  <button {...p} aria-label="Account menu" className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-subtle">
                    <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{initials}</span>
                    <span className="hidden text-left leading-tight sm:block"><span className="block text-[12px] font-medium text-fg">{me.name.split(" ")[0]}</span><span className="block text-[11px] capitalize text-fg-3">{me.role}</span></span>
                  </button>
                )}
                items={[
                  { header: <div><div className="text-[13px] font-medium text-fg">{me.name}</div><div className="text-[12px] text-fg-3">{me.email}</div><div className="mt-1.5"><Badge tone="accent" dot={false} className="capitalize">{me.role}</Badge></div></div> },
                  "divider",
                  { label: "Light theme", icon: <Sun />, onSelect: () => setTheme("light"), hint: theme === "light" ? "active" : undefined },
                  { label: "Dark theme", icon: <Moon />, onSelect: () => setTheme("dark") },
                  { label: "Match system", icon: <Monitor />, onSelect: () => setTheme("system") },
                  "divider",
                  { label: "Settings", icon: <Settings />, onSelect: () => router.push("/settings") },
                  { label: "Sign out", icon: <LogOut />, onSelect: logout, danger: true },
                ]}
              />
            </header>
            {me.role === "viewer" && (
              <div className="flex items-center gap-2 border-b border-line bg-info-soft px-4 py-1.5 text-[12px] text-fg-2 sm:px-6">
                <ShieldCheck className="size-3.5 text-info" />Read-only access — you can investigate, but changes to orders, refunds and workflows are disabled for your role.
              </div>
            )}
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}

function Logo() {
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-fg text-canvas">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
        <path d="M3 13V3l10 10V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <form className="relative w-full max-w-[300px]" role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        const m = v.match(/^(?:nc-?)?(\d{4})$/i);
        router.push(m ? `/orders/NC-${m[1]}` : `/orders?q=${encodeURIComponent(v)}`);
        setQ("");
        ref.current?.blur();
      }}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders"
        placeholder="Search orders or customers…"
        className="h-8 w-full rounded-ctl border border-line bg-surface pl-8 pr-12 text-[13px] text-fg shadow-card placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15" />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-subtle px-1.5 font-sans text-[10px] font-medium text-fg-3 sm:block">⌘K</kbd>
    </form>
  );
}
