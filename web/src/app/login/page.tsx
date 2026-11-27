"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Button, ErrorBox, Field, inputCls } from "@/components/ui";

const DEMO = [
  { role: "Manager", email: "manager@nova.test", note: "approves refunds" },
  { role: "Operator", email: "operator@nova.test", note: "cancels, requests refunds" },
  { role: "Viewer", email: "viewer@nova.test", note: "read-only" },
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink-900 p-10 text-ink-300 lg:flex">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-accent-500 font-bold text-white">N</div>
          <span className="text-[14px] font-semibold text-white">NovaCommerce Operations</span>
        </div>
        <div className="max-w-md space-y-3">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white">One place for orders, payments and shipments.</h1>
          <p className="text-[14px] leading-relaxed">Investigate failures, cancel eligible orders, route refunds through manager approval and automate the follow-ups — on top of the Commerce, Payment and Shipping systems you already run.</p>
        </div>
        <p className="text-[11px] text-ink-500">Built by Infinix Labs for NovaCommerce</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-[18px] font-semibold">Sign in</h2>
            <p className="text-[13px] text-ink-500">Use a demo account. The shared password is in the README.</p>
          </div>
          {error && <ErrorBox error={error} />}
          <Field label="Email">
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <Button type="submit" variant="primary" loading={busy}>
            Sign in
          </Button>
          <div className="space-y-1 border-t border-ink-200 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Demo accounts</p>
            {DEMO.map((d) => (
              <button type="button" key={d.email} onClick={() => setEmail(d.email)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-ink-100">
                <span className="font-medium">{d.role}</span>
                <span className="text-[12px] text-ink-500">{d.email} · {d.note}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
