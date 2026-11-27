"use client";
import { useIsDark } from "./theme";

/** SVG presentation attributes can't read CSS variables, so charts get concrete hex values per theme. */
const LIGHT = { ok: "#10a16f", warn: "#e0a21b", bad: "#e5484d", info: "#3b82f6", violet: "#8b5cf6", neutral: "#a1a7b3", accent: "#4f46e5", grid: "#eceef1", axis: "#858b99", cursor: "#f3f4f6" };
const DARK = { ok: "#3fcf8e", warn: "#f0b542", bad: "#f26d7b", info: "#6ea2ff", violet: "#a98bf0", neutral: "#5c6370", accent: "#7c83f5", grid: "#23272e", axis: "#6f7686", cursor: "#181b20" };

const STATUS: Record<string, keyof typeof LIGHT> = {
  processing: "info", shipped: "violet", delivered: "ok", cancelled: "neutral", captured: "ok", failed: "bad",
  pending: "neutral", delayed: "warn", succeeded: "ok", skipped: "neutral", rejected: "bad", pending_approval: "warn", unconfirmed: "warn",
};

export function useChartColors() {
  const c = useIsDark() ? DARK : LIGHT;
  return { ...c, status: (s: string) => c[STATUS[s] ?? "neutral"] };
}
