export type FoundUpdate = number | { delta: number };

export function resolveFound(current: number, required: number, update: FoundUpdate) {
  const next = typeof update === "number" ? update : current + update.delta;
  return Number.isFinite(next) ? Math.max(0, Math.min(required, Math.floor(next))) : current;
}

/** A plain integer sets the total. A leading + or − adjusts the current total. */
export function parseQuantityEntry(entry: string): FoundUpdate | null {
  const value = entry.trim().replace(/^−/, "-");
  if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
  return /^[+-]/.test(value) ? { delta: Number(value) } : Number(value);
}

export function normalizePartSearch(text: string) {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/(\d)\s*[x×]\s*(?=\d)/g, "$1x")
    .replace(/[^a-z0-9/.+\-]+/g, " ").trim();
}

/** All words must match, in any order; dimensions match exactly (1x2 ≠ 1x20). */
export function createPartMatcher(query: string) {
  const terms = normalizePartSearch(query).split(/\s+/).filter(Boolean);
  return (part: { name: string; partNum: string; colorName: string }) => {
    const text = normalizePartSearch(`${part.name} ${part.partNum} ${part.colorName}`);
    return terms.every((term) => {
      if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/.test(term)) {
        return new RegExp(`(?:^|[^0-9x])${term.replaceAll(".", "\\.")}(?=$|[^0-9.])`).test(text);
      }
      return text.includes(term);
    });
  };
}
