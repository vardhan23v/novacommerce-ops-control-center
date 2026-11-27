/** Amounts are integer paise everywhere; convert only for display. */
export function formatINR(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${paise.toString().padStart(2, "0")}`;
}

/** Parse a rupee string like "1,234.50" into paise without floating point. */
export function parseINR(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + parseInt((m[2] ?? "0").padEnd(2, "0"), 10);
}
