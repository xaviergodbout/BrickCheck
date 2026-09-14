export type ViewMode = "grid" | "list";
export type FilterMode = "all" | "missing" | "found" | "minifigs";
export type PageMode = "check" | "sets";
export type MinifigMode = "assembled" | "parts";
export type ThemeMode = "light" | "dark";
export type SortMode = "part" | "quantity" | "size";
export type SortDirection = "asc" | "desc";
export type GroupMode = "none" | "color" | "status";
export type SearchKind = "all" | "sets" | "minifigs" | "polybag" | "brickheadz" | "mocs";
export type SearchSort = "relevance" | "date_desc" | "date_asc" | "pieces_desc" | "pieces_asc";

export type PartItem = {
  id: string;
  partNum: string;
  bricklinkPartNum?: string;
  colorId?: number;
  bricklinkColorId?: number;
  name: string;
  colorName: string;
  colorRgb: string;
  imageUrl: string;
  quantity: number;
  found: number;
  spare?: boolean;
};

export type MiniFig = {
  id: string;
  figNum: string;
  name: string;
  imageUrl: string;
  quantity: number;
  found: number;
  parts?: PartItem[];
  /** Number of figures represented by the stored component quantities. */
  partsQuantity?: number;
};

export type SavedSet = {
  id: string;
  setNum: string;
  name: string;
  year: number;
  theme: string;
  setImage: string;
  setImages: string[];
  setUrl?: string;
  catalogParts: number;
  parts: PartItem[];
  minifigs: MiniFig[];
  minifigMode: MinifigMode;
  createdAt: string;
  updatedAt: string;
};

export type SearchResult = {
  set_num: string;
  name: string;
  year: number;
  num_parts: number;
  set_img_url: string;
  set_url?: string;
  theme_id?: number;
  themeName?: string;
  kind: "set" | "minifig";
};

export type GalleryState = {
  title: string;
  images: string[];
  index: number;
  externalUrl?: string;
};

export type BrickLinkXmlState = {
  setNum: string;
  xml: string;
  lotCount: number;
  pieceCount: number;
};

export type MocReference = {
  id: string;
  pageUrl: string;
  suggestedName: string;
};

export type MocInventoryRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  spare: boolean;
};

export type MissingPart = {
  part: PartItem;
  quantity: number;
};

export type BrickLinkColorMaps = {
  byRebrickableId: Map<number, number>;
  byName: Map<string, number>;
  byRgb: Map<string, number>;
};

export type BrickCheckAccount = {
  userId: string;
  username: string;
};

export type AccountSyncStatus = "idle" | "loading" | "syncing" | "saved" | "error";

export type CloudAccountRow = {
  user_id: string;
  username: string;
  sets: unknown;
  api_key: string | null;
  active_set_id: string | null;
  updated_at: string;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function externalId(source: unknown, provider: string) {
  if (!source || typeof source !== "object") return undefined;
  const entry = Object.entries(source).find(([name]) => name.toLowerCase() === provider.toLowerCase())?.[1];
  const entryRecord = entry && typeof entry === "object" && !Array.isArray(entry)
    ? entry as Record<string, unknown>
    : undefined;
  const values = Array.isArray(entry)
    ? entry
    : Array.isArray(entryRecord?.ext_ids)
      ? entryRecord.ext_ids
      : entry == null
        ? []
        : [entry];
  const value = values.find((candidate) => candidate != null && String(candidate).trim());
  return value == null ? undefined : String(value);
}

export function normaliseColorKey(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase();
}

export function inferRebrickableColorId(part: PartItem) {
  if (Number.isFinite(part.colorId)) return Number(part.colorId);
  const marker = `:${part.partNum}:`;
  const markerIndex = part.id.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const inferred = Number(part.id.slice(markerIndex + marker.length).split(":")[0]);
  return Number.isFinite(inferred) ? inferred : undefined;
}

export function rebrickableColorPartImage(partNum: string, colorId: number) {
  return `https://cdn.rebrickable.com/media/parts/ldraw/${colorId}/${encodeURIComponent(partNum)}.png`;
}

export function bricklinkColorPartImage(part: PartItem) {
  const partNum = part.bricklinkPartNum ?? part.partNum;
  if (!partNum || !Number.isFinite(part.bricklinkColorId)) return "";
  return `https://img.bricklink.com/ItemImage/PN/${part.bricklinkColorId}/${encodeURIComponent(partNum)}.png`;
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function parseMocReference(value: string): MocReference | null {
  const trimmed = value.trim();
  const match = trimmed.match(/\bMOC-(\d+)\b/i);
  if (!match) return null;
  const id = `MOC-${match[1]}`;
  let pageUrl = `https://rebrickable.com/mocs/${id}/`;
  let suggestedName = `Custom ${id}`;

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)rebrickable\.com$/i.test(url.hostname) || !/\/mocs\//i.test(url.pathname)) return null;
    pageUrl = `${url.origin}${url.pathname}`;
    const segments = url.pathname.split("/").filter(Boolean);
    const mocIndex = segments.findIndex((segment) => segment.toUpperCase() === id);
    const slug = mocIndex >= 0 ? segments[mocIndex + 2] : undefined;
    if (slug) {
      const decoded = decodeURIComponent(slug).replace(/[-_]+/g, " ").trim();
      suggestedName = decoded ? decoded[0].toUpperCase() + decoded.slice(1) : suggestedName;
    }
  } catch {
    // Plain MOC IDs (including surrounding punctuation) are valid references.
  }

  return { id, pageUrl, suggestedName };
}

export function parseCsvRows(source: string) {
  const firstLine = source.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const delimiters = [",", ";", "\t"];
  const delimiter = delimiters.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseMocInventoryCsv(source: string): MocInventoryRow[] {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("That CSV does not contain a parts inventory.");
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
  const findColumn = (...aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const partIndex = findColumn("part", "part num", "part number", "part id", "partnum");
  const colorIndex = findColumn("color", "colour", "color id", "colour id", "colorid");
  const quantityIndex = findColumn("quantity", "qty", "count");
  const spareIndex = findColumn("is spare", "spare", "is extra", "extra");
  if (partIndex < 0 || colorIndex < 0 || quantityIndex < 0) {
    throw new Error("Use Rebrickable CSV format with Part, Color and Quantity columns.");
  }

  const grouped = new Map<string, MocInventoryRow>();
  rows.slice(1).forEach((values) => {
    const partNum = values[partIndex]?.trim();
    const colorId = Number(values[colorIndex]);
    const quantity = Number(values[quantityIndex]);
    if (!partNum || !Number.isFinite(colorId) || !Number.isFinite(quantity) || quantity <= 0) return;
    const spareValue = spareIndex >= 0 ? values[spareIndex]?.trim().toLowerCase() : "";
    const spare = ["true", "yes", "y", "1"].includes(spareValue);
    const key = `${partNum}:${colorId}:${spare ? 1 : 0}`;
    const existing = grouped.get(key);
    grouped.set(key, { partNum, colorId, quantity: (existing?.quantity ?? 0) + Math.floor(quantity), spare });
  });
  const inventory = Array.from(grouped.values());
  if (!inventory.length) throw new Error("No valid parts were found in that CSV.");
  return inventory;
}

export function defaultMocImage(mocId: string) {
  const number = mocId.replace(/^MOC-/i, "");
  return `https://cdn.rebrickable.com/media/thumbs/mocs/moc-${number}.jpg/1000x800p.jpg`;
}

export function isBrickBuiltSet(result: SearchResult) {
  const baseNumber = result.set_num.split("-")[0];
  const nonSetMedia = /\b(activity book|book|magazine|costume|plush|video|dvd|key ?chain|push clip)\b/i;
  return (
    /^\d{2,7}$/.test(baseNumber) &&
    Number(result.num_parts) > 0 &&
    !nonSetMedia.test(result.name)
  );
}

export function isPolybagResult(result: SearchResult) {
  return /\b(polybag|foil pack|promotional|gift with purchase)\b/i.test(`${result.name} ${result.themeName ?? ""}`);
}

export function isBrickHeadzResult(result: SearchResult) {
  return /brick\s*headz/i.test(`${result.name} ${result.themeName ?? ""}`);
}

export function rankSearchResult(result: SearchResult, query: string) {
  const name = result.name.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let score = 0;
  if (result.set_num.toLowerCase() === normalizedQuery) score += 2000;
  if (name === normalizedQuery) score += 1200;
  if (name.startsWith(normalizedQuery)) score += 700;
  if (name.includes(normalizedQuery)) score += 450;
  score += tokens.filter((token) => name.includes(token)).length * 120;
  score += Math.min(result.year || 0, 2100) / 100;
  return score;
}

export function pieceSizeScore(part: PartItem) {
  // Estimate from dimensions, not unrelated numbers such as a print or hole count.
  const number = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
  const dimensions = part.name.match(new RegExp(`\\b(${number}\\s*[x×]\\s*${number}(?:\\s*[x×]\\s*${number})?)`, "i"));
  if (!dimensions) return 0;
  return dimensions[1].split(/\s*[x×]\s*/i).reduce((product, text) => {
    const [whole, fraction] = text.trim().split(/\s+/);
    const fractionText = fraction ?? (whole.includes("/") ? whole : "");
    const [numerator, denominator] = fractionText.split("/").map(Number);
    const value = (whole.includes("/") ? 0 : Number(whole)) + (denominator ? numerator / denominator : 0);
    return product * value;
  }, 1);
}

const partNumberCollator = new Intl.Collator(undefined, { numeric: true });
const sizeCache = new WeakMap<PartItem, number>();
function cachedSize(part: PartItem) {
  if (!sizeCache.has(part)) sizeCache.set(part, pieceSizeScore(part));
  return sizeCache.get(part)!;
}

export function sortParts(parts: PartItem[], sort: SortMode, direction: SortDirection) {
  return [...parts].sort((a, b) => {
    if (sort === "size" && Boolean(cachedSize(a)) !== Boolean(cachedSize(b))) return cachedSize(a) ? -1 : 1;
    const comparison = sort === "quantity"
      ? a.quantity - b.quantity
      : sort === "size"
        ? cachedSize(a) - cachedSize(b)
        : partNumberCollator.compare(a.partNum, b.partNum);
    if (comparison) return direction === "asc" ? comparison : -comparison;
    return partNumberCollator.compare(a.partNum, b.partNum);
  });
}

export function sortDirectionLabel(sort: SortMode, direction: SortDirection) {
  if (sort === "quantity") return direction === "desc" ? "High first" : "Low first";
  if (sort === "size") return direction === "desc" ? "Large first" : "Small first";
  return direction === "asc" ? "Ascending" : "Descending";
}

export type PartGroup = { label: string; note?: string; parts: PartItem[] };

export function groupParts(parts: PartItem[], group: GroupMode, sort: SortMode, direction: SortDirection): PartGroup[] {
  const sorted = sortParts(parts, sort, direction);
  if (!sorted.length) return [];
  if (group === "none") return [{ label: "", parts: sorted }];
  const buckets = new Map<string, PartItem[]>();
  sorted.forEach((part) => {
    const label = group === "color"
      ? part.colorName
      : (part.found >= part.quantity ? "Completed" : "Missing");
    const bucket = buckets.get(label);
    if (bucket) bucket.push(part);
    else buckets.set(label, [part]);
  });
  return Array.from(buckets, ([label, grouped]) => ({ label, parts: grouped }))
    .sort((a, b) => {
      if (group === "status") return a.label === "Missing" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

export function getProgress(set: SavedSet) {
  const requiredParts = set.parts.filter((part) => !part.spare);
  const partRequired = requiredParts.reduce((sum, part) => sum + part.quantity, 0);
  const partFound = requiredParts.reduce((sum, part) => sum + part.found, 0);
  const figItems =
    set.minifigMode === "parts"
      ? set.minifigs.flatMap<Pick<PartItem, "quantity" | "found">>((fig) => fig.parts?.length ? fig.parts.filter((part) => !part.spare) : [fig])
      : set.minifigs;
  const figRequired = figItems.reduce((sum, item) => sum + item.quantity, 0);
  const figFound = figItems.reduce((sum, item) => sum + item.found, 0);
  const required = partRequired + figRequired;
  const found = partFound + figFound;
  return {
    required,
    found,
    percent: required ? (found >= required ? 100 : Math.min(99, Math.round((found / required) * 100))) : 0,
  };
}

export function relativeDate(dateString: string) {
  const elapsed = Date.now() - new Date(dateString).getTime();
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function integer(value: unknown, fallback: number, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.floor(number)) : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalisePart(value: unknown, prefix: string, index: number, isMoc = false): PartItem {
  const part = record(value);
  if (!part.partNum) throw new Error("A saved part is missing its part number. The original file has not been changed.");
  const partNum = String(part.partNum);
  const quantity = integer(part.quantity, 1, 1);
  const normalized: PartItem = {
    id: String(part.id || `${prefix}:${partNum}:${part.colorId ?? 0}:${index}`),
    partNum,
    name: String(part.name || partNum),
    colorName: String(part.colorName || "Unknown color"),
    colorRgb: /^[0-9a-f]{6}$/i.test(String(part.colorRgb)) ? String(part.colorRgb) : "E5E5E5",
    colorId: typeof part.colorId === "number" && Number.isFinite(part.colorId) ? part.colorId : undefined,
    bricklinkPartNum: part.bricklinkPartNum ? String(part.bricklinkPartNum) : undefined,
    bricklinkColorId: typeof part.bricklinkColorId === "number" && Number.isFinite(part.bricklinkColorId) ? part.bricklinkColorId : undefined,
    imageUrl: safeUrl(part.imageUrl),
    quantity,
    found: clamp(integer(part.found, 0), 0, quantity),
    spare: part.spare === true,
  };
  const colorId = inferRebrickableColorId(normalized);
  if (isMoc && colorId != null) normalized.imageUrl = rebrickableColorPartImage(partNum, colorId);
  return normalized;
}

export function normaliseImportedSet(value: unknown): SavedSet | null {
  const set = record(value);
  if (!set.setNum || !set.name) return null;
  if (!Array.isArray(set.parts)) throw new Error("That saved set has no valid parts inventory.");
  const setNum = String(set.setNum);
  const isMoc = /^MOC-\d+$/i.test(setNum);
  const parts = set.parts.map((part, index) => normalisePart(part, setNum, index, isMoc));
  const minifigs = (Array.isArray(set.minifigs) ? set.minifigs : []).map((value, index): MiniFig => {
    const fig = record(value);
    if (!fig.figNum) throw new Error("A saved minifigure is missing its catalog number.");
    const quantity = integer(fig.quantity, 1, 1);
    const basis = integer(fig.partsQuantity, 1, 1);
    return {
      id: String(fig.id || `${fig.figNum}:${index}`),
      figNum: String(fig.figNum),
      name: String(fig.name || fig.figNum),
      imageUrl: safeUrl(fig.imageUrl),
      quantity,
      found: clamp(integer(fig.found, 0), 0, quantity),
      partsQuantity: quantity,
      parts: Array.isArray(fig.parts) ? fig.parts.map((value, index) => {
        const part = normalisePart(value, String(fig.figNum), index);
        const required = Math.max(1, Math.round(part.quantity * quantity / basis));
        return { ...part, quantity: required, found: Math.min(part.found, required) };
      }) : undefined,
    };
  });
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : new Date().toISOString();
  const setImage = safeUrl(set.setImage);
  return {
    id: String(set.id || `${setNum}-${Date.now()}`),
    setNum, name: String(set.name), year: integer(set.year, 0),
    theme: String(set.theme || (isMoc ? "Rebrickable MOC" : "LEGO set")),
    setImage,
    setImages: Array.from(new Set([setImage, ...(Array.isArray(set.setImages) ? set.setImages.map(safeUrl) : [])].filter(Boolean))),
    setUrl: safeUrl(set.setUrl) || undefined,
    catalogParts: integer(set.catalogParts, parts.reduce((total, part) => total + (part.spare ? 0 : part.quantity), 0)),
    parts, minifigs,
    minifigMode: set.minifigMode === "parts" ? "parts" : "assembled",
    createdAt: date(set.createdAt), updatedAt: date(set.updatedAt),
  };
}

export function normaliseSavedSets(values: unknown): SavedSet[] {
  return Array.isArray(values)
    ? values
        .map(normaliseImportedSet)
        .filter((set): set is SavedSet => set !== null && !set.id.startsWith("demo-"))
    : [];
}

export function mergeSavedSets(localSets: SavedSet[], cloudSets: SavedSet[]) {
  const merged = new Map<string, SavedSet>();
  [...localSets, ...cloudSets].forEach((set) => {
    const key = set.setNum.trim().toUpperCase();
    const current = merged.get(key);
    if (!current || new Date(set.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      merged.set(key, set);
    }
  });
  return Array.from(merged.values());
}
