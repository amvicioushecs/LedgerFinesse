/**
 * Parses a dollar string typed or exported by a renter into integer cents.
 * Accepts "$1,234.56", "1234.5", "(45.00)", "-45", "45 CR". String math only.
 * Returns null for anything that is not a clean money value.
 */
export function parseDollarsToCents(raw: string): { cents: number; negative: boolean } | null {
  let text = raw.trim().replace(/[$,\s]/g, "");
  if (text === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/cr$/i.test(text)) {
    negative = true;
    text = text.slice(0, -2);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$|^\.(\d{1,2})$/.exec(text);
  if (!match) return null;
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? match[3] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents)) return null;
  return { cents, negative: negative && cents !== 0 };
}

/** 123456 -> "$1,234.56"; -500 -> "-$5.00". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** 123456 -> "1234.56" for editable inputs and CSV export. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
