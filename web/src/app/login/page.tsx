"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, ShieldCheck, Workflow } from "lucide-react";
import { api, Button, clsx, ErrorBox, Field, inputCls } from "@/components/ui";

const DEMO = [
  { role: "Manager", email: "manager@nova.test", password: "nova-demo-2026", note: "Approves refunds" },
  { role: "Operator", email: "operator@nova.test", password: "nova-demo-2026", note: "Cancels orders, requests refunds" },
  { role: "Viewer", email: "viewer@nova.test", password: "nova-demo-2026", note: "Read-only" },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("operator@nova.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { json: { email, password } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]" />
        <div className="relative flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-fg text-canvas"><svg viewBox="0 0 16 16" className="size-4" fill="none"><path d="M3 13V3l10 10V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <span className="text-[14px] font-semibold">NovaCommerce</span><span className="text-[14px] text-fg-3">Operations</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.03em]">Orders, payments and shipments — in one control center.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-fg-2">Investigate failures, cancel eligible orders, route refunds through manager approval and automate the follow-ups, on top of the systems NovaCommerce already runs.</p>
          <ul className="mt-8 space-y-3 text-[13px] text-fg-2">
            {[[ShieldCheck, "Every refund approved by a manager before money moves"], [Workflow, "Automations that run exactly once per event"], [Bot, "Nova Intelligence investigates using live data"]].map(([I, t], i) => {
              const Icon = I as typeof ShieldCheck;
              return <li key={i} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-md border border-line bg-surface"><Icon className="size-3.5 text-accent" /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <p className="relative text-[12px] text-fg-3">Built by Infinix Labs for NovaCommerce</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="anim-in w-full max-w-[360px] space-y-5">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Sign in</h2>
            <p className="mt-1 text-[13px] text-fg-2">Use a demo account. Shared password: <span className="font-mono text-fg">nova-demo-2026</span></p>
          </div>
          {error && <ErrorBox error={error} />}
          <div className="space-y-3.5">
            <Field label="Email"><input className={inputCls + " h-9"} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" type="email" required /></Field>
            <Field label="Password"><input className={inputCls + " h-9"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus /></Field>
          </div>
          <Button type="submit" variant="primary" loading={busy} className="h-9 w-full">Sign in<ArrowRight className="size-3.5" /></Button>
          <div>
            <div className="mb-2 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-3"><span className="h-px flex-1 bg-line" />Demo accounts<span className="h-px flex-1 bg-line" /></div>
            <div className="space-y-1.5">
              {DEMO.map((d) => (
                <button type="button" key={d.email} onClick={() => { setEmail(d.email); setPassword(d.password); }} aria-pressed={email === d.email}
                  className={clsx("flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors", email === d.email ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong")}>
                  <span><span className="block text-[13px] font-medium">{d.role}</span><span className="block text-[12px] text-fg-3">{d.email}</span><span className="block text-[11px] text-fg-3">Password: <span className="font-mono text-fg-2">{d.password}</span></span></span>
                  <span className="text-right text-[11px] text-fg-3">{d.note}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
