"use client";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  if (t === "system") localStorage.removeItem("nova-theme");
  else localStorage.setItem("nova-theme", t);
  window.dispatchEvent(new Event("nova:theme"));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const read = () => setTheme((localStorage.getItem("nova-theme") as Theme) ?? "system");
    read();
    window.addEventListener("nova:theme", read);
    return () => window.removeEventListener("nova:theme", read);
  }, []);
  return [theme, (t) => { applyTheme(t); setTheme(t); }];
}

/** True when the dark class is active (for chart colours that can't use CSS vars). */
export function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    window.addEventListener("nova:theme", read);
    return () => window.removeEventListener("nova:theme", read);
  }, []);
  return dark;
}
