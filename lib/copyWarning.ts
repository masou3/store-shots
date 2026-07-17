// Both stores bar promotional/ranking copy and calls to action in screenshot
// text. Warning only, never blocking. Explicit CTA phrases only — bare verbs
// like "get" or "download" flag fine headlines and a warning that cries wolf
// gets ignored.
const BANNED_COPY =
  /(\bbest\b|#1|\btop\b|\bnew\b|\bfree\b|\bdiscount\b|\bsale\b|million\s+downloads?|\bdownload\s+now\b|\binstall\s+now\b|\bget\s+it\s+now\b|\bbuy\s+now\b|\btry\s+free\b)/i;

export function copyWarning(text: string): string | null {
  const m = text.match(BANNED_COPY);
  if (!m) return null;
  return `"${m[0]}" — both stores bar promotional copy like this in screenshot text.`;
}
