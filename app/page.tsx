"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ViewMode = "grid" | "list";
type FilterMode = "all" | "missing" | "found" | "minifigs";
type PageMode = "check" | "sets";
type MinifigMode = "assembled" | "parts";
type ThemeMode = "light" | "dark";
type SortMode = "part" | "quantity" | "size";
type SortDirection = "asc" | "desc";
type GroupMode = "none" | "color" | "status";
type SearchKind = "all" | "sets" | "minifigs" | "polybag" | "brickheadz" | "mocs";
type SearchSort = "relevance" | "date_desc" | "date_asc" | "pieces_desc" | "pieces_asc";

type PartItem = {
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

type MiniFig = {
  id: string;
  figNum: string;
  name: string;
  imageUrl: string;
  quantity: number;
  found: number;
  parts?: PartItem[];
};

type SavedSet = {
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

type SearchResult = {
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

type GalleryState = {
  title: string;
  images: string[];
  index: number;
  externalUrl?: string;
};

type BrickLinkXmlState = {
  setNum: string;
  xml: string;
  lotCount: number;
  pieceCount: number;
};

type MocReference = {
  id: string;
  pageUrl: string;
  suggestedName: string;
};

type MocInventoryRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  spare: boolean;
};

type MissingPart = {
  part: PartItem;
  quantity: number;
};

type BrickLinkColorMaps = {
  byRebrickableId: Map<number, number>;
  byName: Map<string, number>;
  byRgb: Map<string, number>;
};

const STORAGE_KEY = "brickcheck:sets:v1";
const API_KEY_STORAGE = "brickcheck:rebrickable-key";
const VIEW_STORAGE = "brickcheck:view";
const SETS_VIEW_STORAGE = "brickcheck:sets-view";
const THEME_STORAGE = "brickcheck:theme";
const SORT_STORAGE = "brickcheck:sort";
const SORT_DIRECTION_STORAGE = "brickcheck:sort-direction";
const GROUP_STORAGE = "brickcheck:group";
const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function externalId(source: unknown, provider: string) {
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

function normaliseColorKey(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase();
}

function inferRebrickableColorId(part: PartItem) {
  if (Number.isFinite(part.colorId)) return Number(part.colorId);
  const marker = `:${part.partNum}:`;
  const markerIndex = part.id.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const inferred = Number(part.id.slice(markerIndex + marker.length).split(":")[0]);
  return Number.isFinite(inferred) ? inferred : undefined;
}

function rebrickableColorPartImage(partNum: string, colorId: number) {
  return `https://cdn.rebrickable.com/media/parts/ldraw/${colorId}/${encodeURIComponent(partNum)}.png`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseMocReference(value: string): MocReference | null {
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

function parseCsvRows(source: string) {
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

function parseMocInventoryCsv(source: string): MocInventoryRow[] {
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

function defaultMocImage(mocId: string) {
  const number = mocId.replace(/^MOC-/i, "");
  return `https://cdn.rebrickable.com/media/thumbs/mocs/moc-${number}.jpg/1000x800p.jpg`;
}

function isBrickBuiltSet(result: SearchResult) {
  const baseNumber = result.set_num.split("-")[0];
  const nonSetMedia = /\b(activity book|book|magazine|costume|plush|video|dvd|key ?chain|push clip)\b/i;
  return (
    /^\d{2,7}$/.test(baseNumber) &&
    Number(result.num_parts) > 0 &&
    !nonSetMedia.test(result.name)
  );
}

function isPolybagResult(result: SearchResult) {
  return /\b(polybag|foil pack|promotional|gift with purchase)\b/i.test(`${result.name} ${result.themeName ?? ""}`);
}

function isBrickHeadzResult(result: SearchResult) {
  return /brick\s*headz/i.test(`${result.name} ${result.themeName ?? ""}`);
}

function rankSearchResult(result: SearchResult, query: string) {
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

function pieceSizeScore(part: PartItem) {
  const dimensions = Array.from(part.name.matchAll(/\b(\d+(?:\s+\d+\/\d+)?)(?=\s*x|\s|$)/gi))
    .slice(0, 3)
    .map((match) => {
      const [whole, fraction] = match[1].split(/\s+/);
      if (!fraction) return Number(whole) || 1;
      const [numerator, denominator] = fraction.split("/").map(Number);
      return (Number(whole) || 0) + (denominator ? numerator / denominator : 0);
    });
  return dimensions.length ? dimensions.reduce((product, value) => product * value, 1) : 0;
}

function sortParts(parts: PartItem[], sort: SortMode, direction: SortDirection) {
  return [...parts].sort((a, b) => {
    const comparison = sort === "quantity"
      ? a.quantity - b.quantity
      : sort === "size"
        ? pieceSizeScore(a) - pieceSizeScore(b)
        : a.partNum.localeCompare(b.partNum, undefined, { numeric: true });
    if (comparison) return direction === "asc" ? comparison : -comparison;
    return a.partNum.localeCompare(b.partNum, undefined, { numeric: true });
  });
}

function sortDirectionLabel(sort: SortMode, direction: SortDirection) {
  if (sort === "quantity") return direction === "desc" ? "High first" : "Low first";
  if (sort === "size") return direction === "desc" ? "Large first" : "Small first";
  return direction === "asc" ? "Ascending" : "Descending";
}

type PartGroup = { label: string; note?: string; parts: PartItem[] };

function groupParts(parts: PartItem[], group: GroupMode, sort: SortMode, direction: SortDirection): PartGroup[] {
  const sorted = sortParts(parts, sort, direction);
  if (!sorted.length) return [];
  if (group === "none") return [{ label: "", parts: sorted }];
  const buckets = new Map<string, PartItem[]>();
  sorted.forEach((part) => {
    const label = group === "color"
      ? part.colorName
      : (part.found >= part.quantity ? "Completed" : "Missing");
    buckets.set(label, [...(buckets.get(label) ?? []), part]);
  });
  return Array.from(buckets, ([label, grouped]) => ({ label, parts: grouped }))
    .sort((a, b) => {
      if (group === "status") return a.label === "Missing" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

function getProgress(set: SavedSet) {
  const requiredParts = set.parts.filter((part) => !part.spare);
  const partRequired = requiredParts.reduce((sum, part) => sum + part.quantity, 0);
  const partFound = requiredParts.reduce((sum, part) => sum + part.found, 0);
  const figItems =
    set.minifigMode === "parts"
      ? set.minifigs.flatMap((fig) => fig.parts ?? [])
      : set.minifigs;
  const figRequired = figItems.reduce((sum, item) => sum + item.quantity, 0);
  const figFound = figItems.reduce((sum, item) => sum + item.found, 0);
  const required = partRequired + figRequired;
  const found = partFound + figFound;
  return {
    required,
    found,
    percent: required ? Math.round((found / required) * 100) : 0,
  };
}

function relativeDate(dateString: string) {
  const elapsed = Date.now() - new Date(dateString).getTime();
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function PartVisual({
  src,
  name,
  color,
  className = "",
}: {
  src: string;
  name: string;
  color?: string;
  className?: string;
}) {
  const anchorName = `--part-preview-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const [failed, setFailed] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const previewTimer = useRef<number | null>(null);

  const beginPreview = () => {
    if (!src || failed) return;
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreviewing(true), 1000);
  };

  const endPreview = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreviewing(false);
  };

  useEffect(() => () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
  }, []);

  if (!src || failed) {
    return (
      <span className={`zoomable-image ${className}`}>
        <span
          className="image-fallback"
          style={{ background: color ? `#${color}` : undefined }}
          aria-label={`${name} image unavailable`}
        >
          <span>{name.slice(0, 2).toUpperCase()}</span>
        </span>
      </span>
    );
  }
  return (
    <>
      <span
        className={`zoomable-image ${className}`}
        style={{ anchorName } as React.CSSProperties}
        onMouseEnter={beginPreview}
        onMouseLeave={endPreview}
      >
        <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />
      </span>
      {previewing && createPortal(
        <span className="image-preview" role="presentation" style={{ positionAnchor: anchorName } as React.CSSProperties}>
          <img src={src} alt="" />
        </span>,
        document.body,
      )}
    </>
  );
}

async function rebrickableFetch(path: string, key: string) {
  const url = path.startsWith("http")
    ? path
    : `https://rebrickable.com/api/v3${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `key ${key.trim()}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("That API key was not accepted. Check it and try again.");
    }
    if (response.status === 404) throw new Error("That set could not be found.");
    throw new Error("Rebrickable is unavailable right now. Please try again.");
  }
  return response.json();
}

async function rebrickableList(path: string, key: string, maxResults = Number.POSITIVE_INFINITY) {
  const results: unknown[] = [];
  let next: string | null = path;
  while (next && results.length < maxResults) {
    const page = (await rebrickableFetch(next, key)) as {
      results?: unknown[];
      next?: string | null;
    };
    results.push(...(page.results ?? []));
    next = page.next ?? null;
  }
  return results.slice(0, maxResults);
}

function mapApiPart(raw: any, prefix = "part"): PartItem {
  const colorId = raw.color?.id ?? "0";
  const partNum = raw.part?.part_num ?? raw.part_num ?? "unknown";
  const bricklinkPartNum = externalId(raw.part?.external_ids ?? raw.external_ids, "BrickLink");
  const bricklinkColorValue = externalId(raw.color?.external_ids, "BrickLink");
  const bricklinkColorId = bricklinkColorValue == null ? undefined : Number(bricklinkColorValue);
  return {
    id: `${prefix}:${partNum}:${colorId}:${raw.id ?? ""}`,
    partNum,
    bricklinkPartNum,
    colorId: Number.isFinite(Number(colorId)) ? Number(colorId) : undefined,
    bricklinkColorId: Number.isFinite(bricklinkColorId) ? bricklinkColorId : undefined,
    name: raw.part?.name ?? raw.name ?? "Unknown part",
    colorName: raw.color?.name ?? "Unknown color",
    colorRgb: raw.color?.rgb ?? "E7E5DF",
    imageUrl: raw.part?.part_img_url ?? raw.part_img_url ?? "",
    quantity: Math.max(Number(raw.quantity) || 1, 1),
    found: 0,
    spare: Boolean(raw.is_spare),
  };
}

function normaliseImportedSet(value: any): SavedSet | null {
  if (!value || typeof value !== "object" || !value.setNum || !value.name) return null;
  const isMoc = /^MOC-\d+$/i.test(String(value.setNum));
  const parts = Array.isArray(value.parts)
    ? value.parts.map((part: PartItem) => {
        const colorId = inferRebrickableColorId(part);
        return {
          ...part,
          imageUrl: isMoc && colorId != null
            ? rebrickableColorPartImage(part.partNum, colorId)
            : part.imageUrl,
          quantity: Math.max(Number(part.quantity) || 1, 1),
          found: clamp(Number(part.found) || 0, 0, Math.max(Number(part.quantity) || 1, 1)),
        };
      })
    : [];
  const minifigs = Array.isArray(value.minifigs)
    ? value.minifigs.map((fig: MiniFig) => ({
        ...fig,
        quantity: Math.max(Number(fig.quantity) || 1, 1),
        found: clamp(Number(fig.found) || 0, 0, Math.max(Number(fig.quantity) || 1, 1)),
        parts: Array.isArray(fig.parts)
          ? fig.parts.map((part) => ({
              ...part,
              quantity: Math.max(Number(part.quantity) || 1, 1),
              found: clamp(Number(part.found) || 0, 0, Math.max(Number(part.quantity) || 1, 1)),
            }))
          : undefined,
      }))
    : [];
  return {
    ...value,
    id: String(value.id || `${value.setNum}-${Date.now()}`),
    setImages: Array.from(new Set(
      (Array.isArray(value.setImages) ? value.setImages : [value.setImage]).filter(Boolean),
    )),
    parts,
    minifigs,
    minifigMode: value.minifigMode === "parts" ? "parts" : "assembled",
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as SavedSet;
}

export default function BrickCheckApp() {
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [activeId, setActiveId] = useState("");
  const [page, setPage] = useState<PageMode>("check");
  const [view, setView] = useState<ViewMode>("grid");
  const [setsView, setSetsView] = useState<ViewMode>("grid");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("part");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [group, setGroup] = useState<GroupMode>("none");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [partQuery, setPartQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchKind, setSearchKind] = useState<SearchKind>("all");
  const [searchSort, setSearchSort] = useState<SearchSort>("relevance");
  const [searching, setSearching] = useState(false);
  const [gallery, setGallery] = useState<GalleryState | null>(null);
  const [addingSet, setAddingSet] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiDraft, setApiDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [exportingBrickLink, setExportingBrickLink] = useState(false);
  const [bricklinkXml, setBricklinkXml] = useState<BrickLinkXmlState | null>(null);
  const [mocOpen, setMocOpen] = useState(false);
  const [mocReferenceInput, setMocReferenceInput] = useState("");
  const [mocName, setMocName] = useState("");
  const [mocImageUrl, setMocImageUrl] = useState("");
  const [mocInventoryText, setMocInventoryText] = useState("");
  const [mocInventoryFileName, setMocInventoryFileName] = useState("");
  const [mocImporting, setMocImporting] = useState(false);
  const [mocError, setMocError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const mocInventoryRef = useRef<HTMLInputElement>(null);
  const bricklinkXmlRef = useRef<HTMLTextAreaElement>(null);
  const searchRequestRef = useRef(0);
  const themeMapRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    try {
      const rawSets = localStorage.getItem(STORAGE_KEY);
      const storedSets = rawSets ? (JSON.parse(rawSets) as SavedSet[]) : [];
      const safeSets = Array.isArray(storedSets)
        ? storedSets
            .map(normaliseImportedSet)
            .filter((set): set is SavedSet => set !== null && !set.id.startsWith("demo-"))
        : [];
      setSets(safeSets);
      setActiveId(safeSets[0]?.id ?? "");
      if (!safeSets.length) setPage("sets");
      const storedKey = localStorage.getItem(API_KEY_STORAGE) ?? "";
      setApiKey(storedKey);
      setApiDraft(storedKey);
      setView(localStorage.getItem(VIEW_STORAGE) === "list" ? "list" : "grid");
      setSetsView(localStorage.getItem(SETS_VIEW_STORAGE) === "list" ? "list" : "grid");
      const storedSort = localStorage.getItem(SORT_STORAGE);
      const resolvedSort = storedSort === "quantity" || storedSort === "size" ? storedSort : "part";
      setSort(resolvedSort);
      const storedSortDirection = localStorage.getItem(SORT_DIRECTION_STORAGE);
      setSortDirection(storedSortDirection === "asc" || storedSortDirection === "desc"
        ? storedSortDirection
        : (resolvedSort === "part" ? "asc" : "desc"));
      const storedGroup = localStorage.getItem(GROUP_STORAGE);
      setGroup(storedGroup === "color" || storedGroup === "status" ? storedGroup : "none");
      const storedTheme = localStorage.getItem(THEME_STORAGE);
      const preferredTheme = storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      setTheme(preferredTheme);
      document.documentElement.dataset.theme = preferredTheme;
    } catch {
      setSets([]);
      setActiveId("");
      setPage("sets");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
  }, [sets, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hydrated) localStorage.setItem(THEME_STORAGE, theme);
  }, [theme, hydrated]);

  const activeSet = sets.find((set) => set.id === activeId) ?? sets[0];
  const progress = activeSet ? getProgress(activeSet) : { required: 0, found: 0, percent: 0 };
  const mocCandidate = parseMocReference(searchQuery);
  const mocDraftReference = parseMocReference(mocReferenceInput);
  const mocInventoryLotCount = useMemo(() => {
    if (!mocInventoryText.trim()) return 0;
    try {
      return parseMocInventoryCsv(mocInventoryText).length;
    } catch {
      return 0;
    }
  }, [mocInventoryText]);
  const visibleSearchResults = useMemo(() => {
    const filtered = searchResults.filter((result) => {
      if (searchKind === "mocs") return false;
      if (searchKind === "minifigs") return result.kind === "minifig";
      if (searchKind === "sets") return result.kind === "set";
      if (searchKind === "polybag") return result.kind === "set" && isPolybagResult(result);
      if (searchKind === "brickheadz") return result.kind === "set" && isBrickHeadzResult(result);
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (searchSort === "date_desc") return b.year - a.year || rankSearchResult(b, searchQuery) - rankSearchResult(a, searchQuery);
      if (searchSort === "date_asc") return a.year - b.year || rankSearchResult(b, searchQuery) - rankSearchResult(a, searchQuery);
      if (searchSort === "pieces_desc") return b.num_parts - a.num_parts || rankSearchResult(b, searchQuery) - rankSearchResult(a, searchQuery);
      if (searchSort === "pieces_asc") return a.num_parts - b.num_parts || rankSearchResult(b, searchQuery) - rankSearchResult(a, searchQuery);
      return rankSearchResult(b, searchQuery) - rankSearchResult(a, searchQuery);
    });
  }, [searchResults, searchKind, searchSort, searchQuery]);

  const updateActive = (updater: (set: SavedSet) => SavedSet) => {
    setSets((current) =>
      current.map((set) =>
        set.id === activeSet?.id
          ? { ...updater(set), updatedAt: new Date().toISOString() }
          : set,
      ),
    );
  };

  const visibleParts = useMemo(() => {
    if (!activeSet) return [];
    if (filter === "minifigs") return [];
    const query = partQuery.trim().toLowerCase();
    return activeSet.parts.filter((part) => {
      const matchesQuery =
        !query ||
        part.name.toLowerCase().includes(query) ||
        part.partNum.toLowerCase().includes(query) ||
        part.colorName.toLowerCase().includes(query);
      const complete = part.found >= part.quantity;
      const matchesFilter = filter === "all" || (filter === "found" ? complete : !complete);
      return matchesQuery && matchesFilter;
    });
  }, [activeSet, partQuery, filter]);

  const visibleMinifigs = useMemo(() => {
    if (!activeSet) return [];
    const query = partQuery.trim().toLowerCase();
    return activeSet.minifigs.filter((fig) => {
      const figParts = fig.parts ?? [];
      const matchesQuery =
        !query ||
        fig.name.toLowerCase().includes(query) ||
        fig.figNum.toLowerCase().includes(query) ||
        figParts.some((part) =>
          `${part.name} ${part.partNum} ${part.colorName}`.toLowerCase().includes(query),
        );
      const complete = activeSet.minifigMode === "assembled"
        ? fig.found >= fig.quantity
        : figParts.length > 0 && figParts.every((part) => part.found >= part.quantity);
      const matchesFilter =
        filter === "all" ||
        filter === "minifigs" ||
        (filter === "found" ? complete : !complete);
      return matchesQuery && matchesFilter;
    });
  }, [activeSet, partQuery, filter]);

  const standardParts = useMemo(
    () => visibleParts.filter((part) => !part.spare),
    [visibleParts],
  );
  const spareParts = useMemo(
    () => visibleParts.filter((part) => part.spare),
    [visibleParts],
  );
  const groupedStandardParts = useMemo(
    () => groupParts(standardParts, group, sort, sortDirection),
    [standardParts, group, sort, sortDirection],
  );
  const groupedSpareParts = useMemo(
    () => groupParts(spareParts, group, sort, sortDirection),
    [spareParts, group, sort, sortDirection],
  );

  const missingLots = activeSet
    ? activeSet.parts.filter((part) => !part.spare && part.found < part.quantity).length +
      activeSet.minifigs.filter((fig) =>
        activeSet.minifigMode === "assembled"
          ? fig.found < fig.quantity
          : (fig.parts ?? []).some((part) => part.found < part.quantity),
      ).length
    : 0;

  const setPartFound = (partId: string, value: number, figId?: string) => {
    updateActive((set) => {
      if (figId) {
        return {
          ...set,
          minifigs: set.minifigs.map((fig) =>
            fig.id === figId
              ? {
                  ...fig,
                  parts: fig.parts?.map((part) =>
                    part.id === partId
                      ? { ...part, found: clamp(value, 0, part.quantity) }
                      : part,
                  ),
                }
              : fig,
          ),
        };
      }
      return {
        ...set,
        parts: set.parts.map((part) =>
          part.id === partId
            ? { ...part, found: clamp(value, 0, part.quantity) }
            : part,
        ),
      };
    });
  };

  const setFigFound = (figId: string, value: number) => {
    updateActive((set) => ({
      ...set,
      minifigs: set.minifigs.map((fig) =>
        fig.id === figId
          ? { ...fig, found: clamp(value, 0, fig.quantity) }
          : fig,
      ),
    }));
  };

  const saveApiKey = () => {
    const key = apiDraft.trim();
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE, key);
    setSettingsOpen(false);
    setNotice(key ? "Rebrickable connected" : "API key removed");
  };

  const openMocImporter = (referenceValue = searchQuery) => {
    const reference = parseMocReference(referenceValue);
    setMocReferenceInput(referenceValue.trim());
    setMocName(reference?.suggestedName ?? "");
    setMocImageUrl(reference ? defaultMocImage(reference.id) : "");
    setMocInventoryText("");
    setMocInventoryFileName("");
    setMocError(referenceValue.trim() && !reference ? "Enter a Rebrickable MOC URL or an ID such as MOC-262378." : "");
    setMocOpen(true);
  };

  const readMocInventoryFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      parseMocInventoryCsv(text);
      setMocInventoryText(text);
      setMocInventoryFileName(file.name);
      setMocError("");
    } catch (fileError) {
      setMocInventoryText("");
      setMocInventoryFileName("");
      setMocError(fileError instanceof Error ? fileError.message : "Could not read that inventory CSV.");
    }
  };

  const importMoc = async () => {
    const reference = parseMocReference(mocReferenceInput);
    if (!reference) {
      setMocError("Enter a Rebrickable MOC URL or an ID such as MOC-262378.");
      return;
    }
    if (!mocName.trim()) {
      setMocError("Give this MOC a name.");
      return;
    }
    if (!mocInventoryText.trim()) {
      setMocError("Add the Rebrickable CSV from the MOC inventory page.");
      return;
    }
    if (!apiKey) {
      setMocError("Connect Rebrickable first so BrickCheck can load the part names, colors and images.");
      setApiDraft(apiKey);
      setSettingsOpen(true);
      return;
    }

    const existing = sets.find((set) => set.setNum.toUpperCase() === reference.id);
    if (existing) {
      setActiveId(existing.id);
      setPage("check");
      setSearchOpen(false);
      setMocOpen(false);
      setNotice("Opened your saved MOC check");
      return;
    }

    setMocImporting(true);
    setMocError("");
    try {
      const inventory = parseMocInventoryCsv(mocInventoryText);
      const partNums = Array.from(new Set(inventory.map((row) => row.partNum)));
      const [rawColors, ...partGroups] = await Promise.all([
        rebrickableList("/lego/colors/?page_size=1000", apiKey),
        ...Array.from({ length: Math.ceil(partNums.length / 150) }, (_, batchIndex) => {
          const batch = partNums.slice(batchIndex * 150, batchIndex * 150 + 150);
          return rebrickableList(
            `/lego/parts/?part_nums=${encodeURIComponent(batch.join(","))}&inc_part_details=1&page_size=1000`,
            apiKey,
          );
        }),
      ]);

      const colors = new Map<number, Record<string, unknown>>();
      rawColors.forEach((value) => {
        const color = value as Record<string, unknown>;
        const colorId = Number(color.id);
        if (Number.isFinite(colorId)) colors.set(colorId, color);
      });
      const partDetails = new Map<string, Record<string, unknown>>();
      partGroups.flat().forEach((value) => {
        const part = value as Record<string, unknown>;
        const partNum = String(part.part_num ?? "");
        if (partNum) partDetails.set(partNum, part);
      });

      const unresolvedParts = partNums.filter((partNum) => !partDetails.has(partNum));
      const unresolvedColors = Array.from(new Set(inventory.map((row) => row.colorId))).filter((colorId) => !colors.has(colorId));
      if (unresolvedParts.length) {
        throw new Error(`Rebrickable could not match ${unresolvedParts.slice(0, 3).join(", ")}${unresolvedParts.length > 3 ? "…" : ""}.`);
      }
      if (unresolvedColors.length) {
        throw new Error(`Rebrickable could not match color ${unresolvedColors.slice(0, 3).join(", ")}.`);
      }

      const parts = inventory.map((row) => ({
        ...mapApiPart({
          id: `${reference.id}:${row.partNum}:${row.colorId}`,
          part: partDetails.get(row.partNum),
          color: colors.get(row.colorId),
          quantity: row.quantity,
          is_spare: row.spare,
        }, reference.id),
        imageUrl: rebrickableColorPartImage(row.partNum, row.colorId),
      }));
      const now = new Date().toISOString();
      const coverImage = mocImageUrl.trim() || defaultMocImage(reference.id);
      const newSet: SavedSet = {
        id: `${reference.id}-${Date.now()}`,
        setNum: reference.id,
        name: mocName.trim(),
        year: new Date().getFullYear(),
        theme: "Rebrickable MOC",
        setImage: coverImage,
        setImages: coverImage ? [coverImage] : [],
        setUrl: reference.pageUrl,
        catalogParts: inventory.filter((row) => !row.spare).reduce((total, row) => total + row.quantity, 0),
        parts,
        minifigs: [],
        minifigMode: "assembled",
        createdAt: now,
        updatedAt: now,
      };
      setSets((current) => [newSet, ...current]);
      setActiveId(newSet.id);
      setPage("check");
      setMocOpen(false);
      setSearchOpen(false);
      setNotice(`${reference.id} added to My Sets`);
    } catch (importError) {
      setMocError(importError instanceof Error ? importError.message : "Could not import that MOC inventory.");
    } finally {
      setMocImporting(false);
    }
  };

  const performSearch = async (queryValue: string, manual = false) => {
    const query = queryValue.trim();
    if ((!manual && query.length < 2) || !query) return;
    if (parseMocReference(query) || searchKind === "mocs") {
      setSearchResults([]);
      setSearching(false);
      setError(manual && !parseMocReference(query) ? "Enter a MOC ID or paste its Rebrickable URL." : "");
      return;
    }
    if (!apiKey) {
      if (manual) {
        setSettingsOpen(true);
        setError("Add a free Rebrickable API key to search the full catalog.");
      }
      return;
    }

    const requestId = ++searchRequestRef.current;
    setError("");
    setSearching(true);
    try {
      const stopWords = new Set(["the", "and", "with", "for", "set"]);
      const tokens = query
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopWords.has(token.toLowerCase()));
      const searchTerms = Array.from(new Set([query, ...(tokens.length > 1 ? tokens.slice(0, 2) : [])]));
      const needsSets = searchKind !== "minifigs";
      const needsMinifigs = searchKind === "all" || searchKind === "minifigs";

      const themesPromise = needsSets && !themeMapRef.current.size
        ? rebrickableList("/lego/themes/?page_size=1000", apiKey, 2000).catch(() => [])
        : Promise.resolve([]);
      const setsPromise = needsSets
        ? Promise.all(searchTerms.map((term) =>
            rebrickableList(`/lego/sets/?search=${encodeURIComponent(term)}&page_size=500`, apiKey, 600),
          ))
        : Promise.resolve([]);
      const minifigsPromise = needsMinifigs
        ? Promise.all(searchTerms.map((term) =>
            rebrickableList(`/lego/minifigs/?search=${encodeURIComponent(term)}&page_size=500`, apiKey, 400),
          ))
        : Promise.resolve([]);

      const [themeRows, setGroups, minifigGroups] = await Promise.all([
        themesPromise,
        setsPromise,
        minifigsPromise,
      ]);
      if (requestId !== searchRequestRef.current) return;

      if (themeRows.length) {
        const rows = new Map<number, { name: string; parent_id?: number | null }>();
        themeRows.forEach((raw) => {
          const theme = raw as { id?: number; name?: string; parent_id?: number | null };
          if (theme.id && theme.name) rows.set(theme.id, { name: theme.name, parent_id: theme.parent_id });
        });
        rows.forEach((theme, id) => {
          const names = [theme.name];
          let parentId = theme.parent_id;
          for (let depth = 0; parentId && depth < 5; depth += 1) {
            const parent = rows.get(parentId);
            if (!parent) break;
            names.unshift(parent.name);
            parentId = parent.parent_id;
          }
          themeMapRef.current.set(id, names.join(" / "));
        });
      }

      const merged = new Map<string, SearchResult>();
      setGroups.flat().forEach((raw) => {
        const set = raw as Omit<SearchResult, "kind">;
        const result: SearchResult = {
          ...set,
          kind: "set",
          themeName: set.theme_id ? themeMapRef.current.get(set.theme_id) : undefined,
        };
        if (result.set_num && isBrickBuiltSet(result)) merged.set(`set:${result.set_num}`, result);
      });
      minifigGroups.flat().forEach((raw) => {
        const minifig = raw as Omit<SearchResult, "kind">;
        const result: SearchResult = { ...minifig, kind: "minifig", themeName: "Minifigure" };
        if (result.set_num && Number(result.num_parts) > 0) merged.set(`minifig:${result.set_num}`, result);
      });

      const results = Array.from(merged.values()).slice(0, 300);
      const matchesCurrentFilter = results.filter((result) => {
        if (searchKind === "minifigs") return result.kind === "minifig";
        if (searchKind === "sets") return result.kind === "set";
        if (searchKind === "polybag") return isPolybagResult(result);
        if (searchKind === "brickheadz") return isBrickHeadzResult(result);
        return true;
      });
      setSearchResults(results);
      if (!matchesCurrentFilter.length) setError("No matching catalog items found.");
    } catch (searchError) {
      if (requestId === searchRequestRef.current) {
        setError(searchError instanceof Error ? searchError.message : "Search failed.");
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  };

  const searchSets = (event?: FormEvent) => {
    event?.preventDefault();
    if (parseMocReference(searchQuery)) {
      openMocImporter(searchQuery);
      return;
    }
    void performSearch(searchQuery, true);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const query = searchQuery.trim();
    if (parseMocReference(query) || searchKind === "mocs") {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      setError("");
      return;
    }
    if (query.length < 2) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearching(false);
      setError("");
      return;
    }
    const timer = window.setTimeout(() => void performSearch(query), 400);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchOpen, searchKind, apiKey]);

  const addSearchResult = async (result: SearchResult) => {
    if (sets.some((set) => set.setNum === result.set_num)) {
      const existing = sets.find((set) => set.setNum === result.set_num)!;
      setActiveId(existing.id);
      setPage("check");
      setSearchOpen(false);
      setNotice("Opened your saved check");
      return;
    }
    setAddingSet(result.set_num);
    setError("");
    try {
      const [rawParts, rawMinifigs] = result.kind === "minifig"
        ? await Promise.all([
            rebrickableList(`/lego/minifigs/${encodeURIComponent(result.set_num)}/parts/?page_size=1000&inc_part_details=1`, apiKey),
            Promise.resolve([]),
          ])
        : await Promise.all([
            rebrickableList(
              `/lego/sets/${encodeURIComponent(result.set_num)}/parts/?page_size=1000&inc_minifig_parts=0&inc_part_details=1`,
              apiKey,
            ),
            rebrickableList(
              `/lego/sets/${encodeURIComponent(result.set_num)}/minifigs/?page_size=1000`,
              apiKey,
            ),
          ]);
      const now = new Date().toISOString();
      const newSet: SavedSet = {
        id: `${result.set_num}-${Date.now()}`,
        setNum: result.set_num,
        name: result.name,
        year: result.year,
        theme: result.kind === "minifig" ? "Minifigure" : (result.themeName ?? "LEGO set"),
        setImage: result.set_img_url,
        setImages: result.set_img_url ? [result.set_img_url] : [],
        setUrl: result.set_url,
        catalogParts: result.num_parts,
        parts: rawParts.map((part) => mapApiPart(part)),
        minifigs: rawMinifigs.map((raw: any) => ({
          id: raw.set_num,
          figNum: raw.set_num,
          name: raw.set_name,
          imageUrl: raw.set_img_url,
          quantity: Math.max(Number(raw.quantity) || 1, 1),
          found: 0,
        })),
        minifigMode: "assembled",
        createdAt: now,
        updatedAt: now,
      };
      setSets((current) => [newSet, ...current]);
      setActiveId(newSet.id);
      setPage("check");
      setSearchOpen(false);
      setNotice(`${result.set_num} added to My Sets`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not load that inventory.");
    } finally {
      setAddingSet("");
    }
  };

  const loadMinifigParts = async () => {
    if (!activeSet) return;
    if (activeSet.minifigs.every((fig) => fig.parts?.length)) {
      updateActive((set) => ({ ...set, minifigMode: "parts" }));
      return;
    }
    if (!apiKey) {
      setError("Connect Rebrickable before loading disassembled minifig parts.");
      setSettingsOpen(true);
      return;
    }
    setAddingSet("minifig-parts");
    try {
      const figures = await Promise.all(
        activeSet.minifigs.map(async (fig) => {
          if (fig.parts?.length) return fig;
          const rawParts = await rebrickableList(
            `/lego/minifigs/${encodeURIComponent(fig.figNum)}/parts/?page_size=1000&inc_part_details=1`,
            apiKey,
          );
          return {
            ...fig,
            parts: rawParts.map((part) => mapApiPart(part, fig.figNum)),
          };
        }),
      );
      updateActive((set) => ({ ...set, minifigs: figures, minifigMode: "parts" }));
    } catch (figError) {
      setError(figError instanceof Error ? figError.message : "Could not load minifig parts.");
    } finally {
      setAddingSet("");
    }
  };

  const downloadText = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = (filename: string, payload: unknown) => {
    downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
  };

  const exportSet = (set: SavedSet) => {
    downloadJson(`brickcheck-${set.setNum}.json`, {
      format: "brickcheck",
      version: 1,
      exportedAt: new Date().toISOString(),
      sets: [set],
    });
    setNotice(`${set.setNum} exported`);
  };

  const exportAll = () => {
    downloadJson("brickcheck-all-sets.json", {
      format: "brickcheck",
      version: 1,
      exportedAt: new Date().toISOString(),
      sets,
    });
    setNotice(`${sets.length} set${sets.length === 1 ? "" : "s"} exported`);
  };

  const exportMissingBrickLink = async () => {
    if (!activeSet || exportingBrickLink) return;
    setExportingBrickLink(true);
    setBricklinkXml(null);
    setError("");

    try {
      const missingParts: MissingPart[] = activeSet.parts
        .filter((part) => !part.spare && part.found < part.quantity)
        .map((part) => ({ part, quantity: part.quantity - part.found }));

      if (activeSet.minifigMode === "parts") {
        activeSet.minifigs.forEach((fig) => {
          (fig.parts ?? [])
            .filter((part) => !part.spare && part.found < part.quantity)
            .forEach((part) => missingParts.push({ part, quantity: part.quantity - part.found }));
        });
      } else {
        for (const fig of activeSet.minifigs) {
          const missingFigures = fig.quantity - fig.found;
          if (missingFigures <= 0) continue;
          let figureParts = fig.parts;
          if (!figureParts?.length) {
            if (!apiKey) {
              setApiDraft(apiKey);
              setSettingsOpen(true);
              throw new Error("Connect Rebrickable to expand missing minifigures into orderable parts.");
            }
            const rawParts = await rebrickableList(
              `/lego/minifigs/${encodeURIComponent(fig.figNum)}/parts/?page_size=1000&inc_part_details=1`,
              apiKey,
            );
            figureParts = rawParts.map((part) => mapApiPart(part, fig.figNum));
          }
          figureParts
            .filter((part) => !part.spare)
            .forEach((part) => missingParts.push({ part, quantity: part.quantity * missingFigures }));
        }
      }

      if (!missingParts.length) {
        setNotice("No missing parts to export — this check is complete.");
        return;
      }

      const needsColorMap = missingParts.some(({ part }) => !Number.isFinite(part.bricklinkColorId));
      const colorMaps: BrickLinkColorMaps = {
        byRebrickableId: new Map(),
        byName: new Map(),
        byRgb: new Map(),
      };

      if (needsColorMap) {
        if (!apiKey) {
          setApiDraft(apiKey);
          setSettingsOpen(true);
          throw new Error("Connect Rebrickable to map saved colors to BrickLink color IDs.");
        }
        const rawColors = await rebrickableList("/lego/colors/?page_size=1000", apiKey);
        rawColors.forEach((value) => {
          const raw = value as { external_ids?: unknown; id?: unknown; name?: unknown; rgb?: unknown };
          const bricklinkValue = externalId(raw.external_ids, "BrickLink");
          const bricklinkId = bricklinkValue == null ? Number.NaN : Number(bricklinkValue);
          if (!Number.isFinite(bricklinkId)) return;
          const rebrickableId = Number(raw.id);
          if (Number.isFinite(rebrickableId)) colorMaps.byRebrickableId.set(rebrickableId, bricklinkId);
          if (raw.name) colorMaps.byName.set(String(raw.name).trim().toLowerCase(), bricklinkId);
          if (raw.rgb) colorMaps.byRgb.set(normaliseColorKey(String(raw.rgb)), bricklinkId);
        });
      }

      const unresolvedPartNums = Array.from(new Set(
        missingParts
          .filter(({ part }) => !part.bricklinkPartNum)
          .map(({ part }) => part.partNum)
          .filter((partNum) => partNum && partNum !== "unknown"),
      ));
      const bricklinkPartNumbers = new Map<string, string>();
      if (apiKey && unresolvedPartNums.length) {
        for (let index = 0; index < unresolvedPartNums.length; index += 150) {
          const partNums = unresolvedPartNums.slice(index, index + 150);
          const rawParts = await rebrickableList(
            `/lego/parts/?part_nums=${encodeURIComponent(partNums.join(","))}&inc_part_details=1&page_size=1000`,
            apiKey,
          );
          rawParts.forEach((value) => {
            const raw = value as { part_num?: unknown; external_ids?: unknown };
            const partNum = String(raw.part_num ?? "");
            const bricklinkPartNum = externalId(raw.external_ids, "BrickLink");
            if (partNum && bricklinkPartNum) bricklinkPartNumbers.set(partNum, bricklinkPartNum);
          });
        }
      }

      const groupedLots = new Map<string, { itemId: string; colorId: number; quantity: number }>();
      const unmappedColors = new Set<string>();
      missingParts.forEach(({ part, quantity }) => {
        const rebrickableColorId = inferRebrickableColorId(part);
        const colorId = Number.isFinite(part.bricklinkColorId)
          ? Number(part.bricklinkColorId)
          : (rebrickableColorId == null ? undefined : colorMaps.byRebrickableId.get(rebrickableColorId))
            ?? colorMaps.byName.get(part.colorName.trim().toLowerCase())
            ?? colorMaps.byRgb.get(normaliseColorKey(part.colorRgb));
        if (!Number.isFinite(colorId)) {
          unmappedColors.add(part.colorName);
          return;
        }
        const itemId = part.bricklinkPartNum ?? bricklinkPartNumbers.get(part.partNum) ?? part.partNum;
        const key = `${itemId}:${colorId}`;
        const existing = groupedLots.get(key);
        groupedLots.set(key, {
          itemId,
          colorId: Number(colorId),
          quantity: (existing?.quantity ?? 0) + quantity,
        });
      });

      if (unmappedColors.size) {
        throw new Error(`Could not map ${Array.from(unmappedColors).slice(0, 3).join(", ")} to BrickLink colors.`);
      }

      const remarks = escapeXml(`BrickCheck ${activeSet.setNum}`);
      const items = Array.from(groupedLots.values())
        .sort((a, b) => a.itemId.localeCompare(b.itemId, undefined, { numeric: true }) || a.colorId - b.colorId)
        .map((lot) => [
          "  <ITEM>",
          "    <ITEMTYPE>P</ITEMTYPE>",
          `    <ITEMID>${escapeXml(lot.itemId)}</ITEMID>`,
          `    <COLOR>${lot.colorId}</COLOR>`,
          `    <MINQTY>${lot.quantity}</MINQTY>`,
          `    <REMARKS>${remarks}</REMARKS>`,
          "  </ITEM>",
        ].join("\n"));
      const xml = ["<INVENTORY>", ...items, "</INVENTORY>", ""].join("\n");
      const pieceCount = Array.from(groupedLots.values()).reduce((total, lot) => total + lot.quantity, 0);
      setBricklinkXml({
        setNum: activeSet.setNum,
        xml,
        lotCount: groupedLots.size,
        pieceCount,
      });
    } catch (exportError) {
      setNotice(exportError instanceof Error ? exportError.message : "Could not generate the BrickLink XML.");
    } finally {
      setExportingBrickLink(false);
    }
  };

  const copyBricklinkXml = async () => {
    if (!bricklinkXml) return;
    try {
      await navigator.clipboard.writeText(bricklinkXml.xml);
      setNotice("BrickLink XML copied to clipboard");
    } catch {
      const textArea = bricklinkXmlRef.current;
      textArea?.focus();
      textArea?.select();
      if (textArea && document.execCommand("copy")) {
        setNotice("BrickLink XML copied to clipboard");
      } else {
        setNotice("Select the XML and copy it manually.");
      }
    }
  };

  const importSets = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incomingValues: unknown[] = Array.isArray(data?.sets)
        ? data.sets
        : data?.setNum
          ? [data]
          : [];
      const incoming = incomingValues
        .map(normaliseImportedSet)
        .filter((set): set is SavedSet => set !== null && !set.id.startsWith("demo-"));
      if (!incoming.length) throw new Error("No BrickCheck sets were found in that file.");
      setSets((current) => {
        const merged = [...current];
        incoming.forEach((set) => {
          const index = merged.findIndex(
            (candidate) => candidate.id === set.id || candidate.setNum === set.setNum,
          );
          if (index >= 0) merged[index] = set;
          else merged.unshift(set);
        });
        return merged;
      });
      setActiveId(incoming[0].id);
      setPage("check");
      setNotice(`${incoming.length} set${incoming.length === 1 ? "" : "s"} imported`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "That file could not be imported.");
    }
  };

  const deleteSet = (set: SavedSet) => {
    const remaining = sets.filter((candidate) => candidate.id !== set.id);
    setSets(remaining);
    if (activeId === set.id) setActiveId(remaining[0]?.id ?? "");
    setNotice(`${set.setNum} removed`);
  };

  const openSet = (set: SavedSet) => {
    setActiveId(set.id);
    setPage("check");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openGallery = (title: string, images: string[], externalUrl?: string) => {
    const uniqueImages = Array.from(new Set(images.filter(Boolean)));
    if (!uniqueImages.length) return;
    setGallery({ title, images: uniqueImages, index: 0, externalUrl });
  };

  if (!hydrated) {
    return (
      <main className="loading-screen">
        <img className="brand-symbol loading-logo" src={`${APP_BASE_PATH}/brickcheck-icon.webp`} alt="" />
        <strong>BrickCheck</strong>
        <span>Opening your workbench…</span>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setPage("sets"); setMobileMenuOpen(false); }}>
          <img className="brand-symbol" src={`${APP_BASE_PATH}/brickcheck-icon.webp`} alt="" />
          <span>Brick<span>Check</span></span>
        </button>
        <nav aria-label="Main navigation">
          <button className={page === "check" ? "active" : ""} onClick={() => setPage("check")}>Workbench</button>
          <button className={page === "sets" ? "active" : ""} onClick={() => setPage("sets")}>
            My Sets <span className="nav-count">{sets.length}</span>
          </button>
        </nav>
        <button className="catalog-search" onClick={() => setSearchOpen(true)}>
          <span aria-hidden="true">⌕</span>
          <span>Find a set by name or number</span>
        </button>
        <div className="top-actions">
          <button className="icon-button" aria-label="Rebrickable settings" onClick={() => { setApiDraft(apiKey); setSettingsOpen(true); }}>⚙</button>
          <button className="primary small new-check-button" aria-label="Start a new check" onClick={() => setSearchOpen(true)}><span aria-hidden="true">＋</span><span className="new-check-label">New check</span></button>
          <button
            className="icon-button mobile-menu-button"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? "×" : "☰"}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="mobile-menu">
            <button onClick={() => { setPage("check"); setMobileMenuOpen(false); }}>Workbench</button>
            <button onClick={() => { setPage("sets"); setMobileMenuOpen(false); }}>My Sets <span>{sets.length}</span></button>
            <button onClick={() => { setApiDraft(apiKey); setSettingsOpen(true); setMobileMenuOpen(false); }}>Settings &amp; API</button>
          </div>
        )}
      </header>

      <input ref={importRef} className="hidden-input" type="file" accept="application/json,.json" onChange={importSets} />

      {page === "sets" ? (
        <main className="sets-page">
          <section className="page-heading">
            <div>
              <p className="eyebrow">YOUR COLLECTION</p>
              <h1>My Sets</h1>
              <p>Every active parts check, saved automatically on this device.</p>
            </div>
            <div className="heading-actions">
              <div className="view-switch sets-view-switch" role="group" aria-label="My Sets view style">
                <button className={setsView === "grid" ? "active" : ""} aria-label="Grid view" onClick={() => { setSetsView("grid"); localStorage.setItem(SETS_VIEW_STORAGE, "grid"); }}>▦</button>
                <button className={setsView === "list" ? "active" : ""} aria-label="List view" onClick={() => { setSetsView("list"); localStorage.setItem(SETS_VIEW_STORAGE, "list"); }}>☷</button>
              </div>
              <button className="secondary" onClick={() => importRef.current?.click()}>↥ Import</button>
              <button className="primary" onClick={exportAll}>↓ Export all</button>
            </div>
          </section>

          <section className={`sets-grid ${setsView}`} aria-label="Saved sets">
            <button className="new-set-card" onClick={() => setSearchOpen(true)}>
              <span className="new-plus">＋</span>
              <strong>Start a new BrickCheck</strong>
              <small>Search the LEGO catalog</small>
            </button>
            {sets.map((set) => {
              const cardProgress = getProgress(set);
              return (
                <article className="set-card" key={set.id}>
                  <button className="set-card-main" onClick={() => openSet(set)}>
                    <div className="set-card-image">
                      <PartVisual src={set.setImage} name={set.name} />
                      {cardProgress.percent === 100 && <span className="complete-badge">✓ Complete</span>}
                    </div>
                    <div className="set-card-copy">
                      <div className="set-meta"><span>{set.setNum}</span><span>{set.year}</span></div>
                      <h2>{set.name}</h2>
                      <div className="card-progress-line">
                        <span style={{ width: `${cardProgress.percent}%` }} />
                      </div>
                      <div className="card-progress-copy">
                        <strong>{cardProgress.percent}%</strong>
                        <span>{cardProgress.found} of {cardProgress.required} checked</span>
                      </div>
                    </div>
                  </button>
                  <div className="set-card-footer">
                    <span>Updated {relativeDate(set.updatedAt)}</span>
                    <div>
                      <button aria-label={`Export ${set.name}`} onClick={() => exportSet(set)}>↓</button>
                      <button aria-label={`Delete ${set.name}`} onClick={() => deleteSet(set)}>×</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </main>
      ) : activeSet ? (
        <main className="workbench">
          <section className="set-hero">
            <button
              className="set-cover"
              aria-label={`Open image gallery for ${activeSet.name}`}
              onClick={() => openGallery(activeSet.name, activeSet.setImages?.length ? activeSet.setImages : [activeSet.setImage], activeSet.setUrl)}
            >
              <PartVisual src={activeSet.setImage} name={activeSet.name} />
              <span className="gallery-badge">View photo{activeSet.setImages?.length > 1 ? "s" : ""}</span>
            </button>
            <div className="set-title-block">
              <button className="back-link" onClick={() => setPage("sets")}>← My Sets</button>
              <div className="set-kicker"><span>{activeSet.setNum}</span><span>{activeSet.year}</span><span>{activeSet.theme}</span></div>
              <h1>{activeSet.name}</h1>
              <p>{activeSet.parts.length} part lots · {activeSet.minifigs.length} minifig{activeSet.minifigs.length === 1 ? "" : "s"} · {activeSet.catalogParts.toLocaleString()} catalog pieces</p>
            </div>
            <div className="progress-summary">
              <div className="progress-ring" style={{ "--progress": `${progress.percent * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{progress.percent}%</strong><span>found</span></div>
              </div>
              <div className="progress-numbers">
                <strong>{progress.found}<span> / {progress.required}</span></strong>
                <small>pieces checked</small>
              </div>
              <div className="progress-actions">
                <button className="secondary compact" onClick={() => exportSet(activeSet)}>↓ Save file</button>
                <button
                  className="secondary compact bricklink-export"
                  aria-label="Generate copyable BrickLink Wanted List XML"
                  title="Generate copyable BrickLink Wanted List XML"
                  disabled={exportingBrickLink || missingLots === 0}
                  onClick={() => void exportMissingBrickLink()}
                >
                  {exportingBrickLink ? "Preparing…" : "Copy BrickLink XML"}
                </button>
              </div>
            </div>
          </section>

          <section className="inventory-toolbar">
            <div className="filter-tabs" role="group" aria-label="Filter parts">
              {(["all", "missing", "found", "minifigs"] as FilterMode[]).map((item) => (
                <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                  {item === "minifigs" ? "Minifigs" : item[0].toUpperCase() + item.slice(1)}
                  {item === "missing" && <span>{missingLots}</span>}
                  {item === "minifigs" && <span>{activeSet.minifigs.length}</span>}
                </button>
              ))}
            </div>
            <label className="parts-search">
              <span aria-hidden="true">⌕</span>
              <input value={partQuery} onChange={(event) => setPartQuery(event.target.value)} placeholder="Filter by part, color or ID" />
            </label>
            <div className="inventory-sort">
              <label className="inventory-select">
                <span>Sort</span>
                <select value={sort} onChange={(event) => {
                  const value = event.target.value as SortMode;
                  const nextDirection: SortDirection = value === "part" ? "asc" : "desc";
                  setSort(value);
                  setSortDirection(nextDirection);
                  localStorage.setItem(SORT_STORAGE, value);
                  localStorage.setItem(SORT_DIRECTION_STORAGE, nextDirection);
                }}>
                  <option value="part">Part number</option>
                  <option value="quantity">Quantity</option>
                  <option value="size">Piece size</option>
                </select>
              </label>
              <button
                className="sort-direction-button"
                aria-label={`Reverse sort order. Currently ${sortDirectionLabel(sort, sortDirection)}`}
                onClick={() => {
                  const nextDirection = sortDirection === "asc" ? "desc" : "asc";
                  setSortDirection(nextDirection);
                  localStorage.setItem(SORT_DIRECTION_STORAGE, nextDirection);
                }}
              >
                <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
                {sortDirectionLabel(sort, sortDirection)}
              </button>
            </div>
            <label className="inventory-select">
              <span>Group</span>
              <select value={group} onChange={(event) => {
                const value = event.target.value as GroupMode;
                setGroup(value);
                localStorage.setItem(GROUP_STORAGE, value);
              }}>
                <option value="none">No grouping</option>
                <option value="color">Color</option>
                <option value="status">Missing / completed</option>
              </select>
            </label>
            <div className="view-switch" role="group" aria-label="View style">
              <button className={view === "grid" ? "active" : ""} aria-label="Grid view" onClick={() => { setView("grid"); localStorage.setItem(VIEW_STORAGE, "grid"); }}>▦</button>
              <button className={view === "list" ? "active" : ""} aria-label="List view" onClick={() => { setView("list"); localStorage.setItem(VIEW_STORAGE, "list"); }}>☷</button>
            </div>
          </section>

          {filter !== "minifigs" && (
            <section className="inventory-section">
              <div className="section-heading">
                <div>
                  <h2>Standard parts</h2>
                  <span>{standardParts.length} lots shown</span>
                </div>
                <p>Tap a checkmark to mark the full quantity, or count pieces one by one.</p>
              </div>
              {standardParts.length ? (
                <PartGroups groups={groupedStandardParts} view={view} onFound={(part, value) => setPartFound(part.id, value)} />
              ) : (
                <div className="empty-state"><span>⌕</span><strong>No parts match</strong><p>Try another filter or search term.</p></div>
              )}
            </section>
          )}

          {(activeSet.minifigs.length > 0 || filter === "minifigs") && (
            <section className="inventory-section minifig-section">
              <div className="section-heading minifig-heading">
                <div>
                  <span className="section-chip">SEPARATE BIN</span>
                  <h2>Minifigures</h2>
                  <p>Keep figures together, or break them down into individual parts.</p>
                </div>
                <div className="mode-switch" role="group" aria-label="Minifigure display mode">
                  <button className={activeSet.minifigMode === "assembled" ? "active" : ""} onClick={() => updateActive((set) => ({ ...set, minifigMode: "assembled" }))}>Assembled</button>
                  <button className={activeSet.minifigMode === "parts" ? "active" : ""} disabled={addingSet === "minifig-parts"} onClick={loadMinifigParts}>{addingSet === "minifig-parts" ? "Loading…" : "Disassembled"}</button>
                </div>
              </div>
              {!visibleMinifigs.length ? (
                <div className="empty-state"><strong>No minifigures match</strong><p>Try another filter or search term.</p></div>
              ) : activeSet.minifigMode === "assembled" ? (
                <div className="minifig-grid">
                  {visibleMinifigs.map((fig) => (
                    <article
                      className={`minifig-card ${fig.found >= fig.quantity ? "is-found" : ""}`}
                      key={fig.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Add one found ${fig.name}`}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("button")) return;
                        if (fig.found < fig.quantity) setFigFound(fig.id, fig.found + 1);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if ((event.key === "Enter" || event.key === " ") && fig.found < fig.quantity) {
                          event.preventDefault();
                          setFigFound(fig.id, fig.found + 1);
                        }
                      }}
                    >
                      <button className="image-check" aria-label={fig.found >= fig.quantity ? `Mark ${fig.name} missing` : `Mark ${fig.name} found`} onClick={() => setFigFound(fig.id, fig.found >= fig.quantity ? 0 : fig.quantity)}>{fig.found >= fig.quantity ? "✓" : ""}</button>
                      <div className="minifig-image"><PartVisual src={fig.imageUrl} name={fig.name} /></div>
                      <div><span className="part-number">{fig.figNum}</span><h3>{fig.name}</h3></div>
                      <Counter found={fig.found} quantity={fig.quantity} onChange={(value) => setFigFound(fig.id, value)} />
                    </article>
                  ))}
                </div>
              ) : (
                <div className="fig-parts-groups">
                  {visibleMinifigs.map((fig) => (
                    <div className="fig-parts-group" key={fig.id}>
                      <div className="fig-group-label">
                        <PartVisual src={fig.imageUrl} name={fig.name} />
                        <div><span>{fig.figNum}</span><strong>{fig.name}</strong></div>
                      </div>
                      <PartGroups
                        groups={groupParts(
                          (fig.parts ?? []).filter((part) => {
                            if (filter === "found") return part.found >= part.quantity;
                            if (filter === "missing") return part.found < part.quantity;
                            return true;
                          }),
                          group,
                          sort,
                          sortDirection,
                        )}
                        view={view}
                        onFound={(part, value) => setPartFound(part.id, value, fig.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {filter !== "minifigs" && activeSet.parts.some((part) => part.spare) && (
            <section className="inventory-section spare-section">
              <div className="section-heading spare-heading">
                <div>
                  <span className="section-chip">EXTRA PIECES</span>
                  <h2>Spare parts</h2>
                  <span>{spareParts.length} lots shown</span>
                </div>
                <p>These extras are packed separately from the pieces required to complete the model.</p>
              </div>
              {spareParts.length ? (
                <PartGroups groups={groupedSpareParts} view={view} onFound={(part, value) => setPartFound(part.id, value)} />
              ) : (
                <div className="empty-state"><strong>No spare parts match</strong><p>Try another filter or search term.</p></div>
              )}
            </section>
          )}
        </main>
      ) : (
        <main className="no-set">
          <div className="new-plus">＋</div>
          <h1>Start your first BrickCheck</h1>
          <p>Find a set, then work through every pictured part.</p>
          <button className="primary" onClick={() => setSearchOpen(true)}>Find a set</button>
        </main>
      )}

      <footer>
        <span>BrickCheck</span>
        <p>Catalog data and images are retrieved from Rebrickable. LEGO® is a trademark of the LEGO Group, which does not sponsor this app.</p>
        <a href="https://rebrickable.com/api/" target="_blank" rel="noreferrer">Data source ↗</a>
      </footer>

      {searchOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}>
          <section className={`search-modal ${searchResults.length ? "has-results" : ""}`} role="dialog" aria-modal="true" aria-labelledby="search-title">
            <button className="modal-close" aria-label="Close" onClick={() => setSearchOpen(false)}>×</button>
            <p className="eyebrow">NEW BRICKCHECK</p>
            <h2 id="search-title">Which build is in the bin?</h2>
            <p>Search LEGO sets, or paste a Rebrickable MOC URL or ID.</p>
            <form className="big-search" onSubmit={searchSets}>
              <span aria-hidden="true">⌕</span>
              <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Try 75379, Batman or MOC-262378" />
              <button disabled={searching}>{searching ? "Searching…" : mocCandidate ? "Import MOC" : "Search"}</button>
            </form>
            <div className="search-controls">
              <div className="search-kind-tabs" role="group" aria-label="Catalog type">
                {([
                  ["all", "All"],
                  ["sets", "Sets"],
                  ["minifigs", "Minifigs"],
                  ["polybag", "Polybags"],
                  ["brickheadz", "BrickHeadz"],
                  ["mocs", "Custom MOCs"],
                ] as [SearchKind, string][]).map(([value, label]) => (
                  <button type="button" className={searchKind === value ? "active" : ""} key={value} onClick={() => setSearchKind(value)}>{label}</button>
                ))}
              </div>
              {searchKind !== "mocs" && <label className="search-sort">
                <span>Sort</span>
                <select value={searchSort} onChange={(event) => setSearchSort(event.target.value as SearchSort)}>
                  <option value="relevance">Best match</option>
                  <option value="date_desc">Newest first</option>
                  <option value="date_asc">Oldest first</option>
                  <option value="pieces_desc">Piece count: high to low</option>
                  <option value="pieces_asc">Piece count: low to high</option>
                </select>
              </label>}
            </div>
            {error && <div className="inline-error">{error}</div>}
            {mocCandidate && (
              <div className="moc-detected-card">
                <div className="moc-detected-mark">MOC</div>
                <div><span>REBRICKABLE CUSTOM BUILD</span><strong>{mocCandidate.id}</strong><small>{mocCandidate.suggestedName}</small></div>
                <button type="button" className="primary small" onClick={() => openMocImporter(searchQuery)}>Import inventory</button>
              </div>
            )}
            {searchKind === "mocs" && !mocCandidate && (
              <div className="moc-help-card">
                <div><span>MOC</span></div>
                <p><strong>Add a custom Rebrickable MOC</strong><small>Paste its page URL or ID above, then add the inventory CSV exported by Rebrickable.</small></p>
                <button type="button" onClick={() => openMocImporter()}>Import MOC</button>
              </div>
            )}
            <p className="search-filter-note">Official results hide books, costumes, clips, videos, and zero-part entries. Custom MOCs are imported separately.</p>
            {!apiKey && (
              <div className="source-callout">
                <div><span>R</span></div>
                <p><strong>Connect the set catalog</strong><small>A free Rebrickable API key unlocks exact inventories and part images. It stays in this browser.</small></p>
                <button onClick={() => { setApiDraft(apiKey); setSettingsOpen(true); }}>Connect</button>
              </div>
            )}
            {visibleSearchResults.length > 0 && (
              <>
                <div className="search-results-heading"><strong>{visibleSearchResults.length} results</strong><span>{searching ? "Updating suggestions…" : "Grid view"}</span></div>
                <div className="search-results">
                  {visibleSearchResults.map((result) => (
                    <article key={`${result.kind}:${result.set_num}`}>
                      <button className="search-result-image" aria-label={`View ${result.name} photo`} onClick={() => openGallery(result.name, result.set_img_url ? [result.set_img_url] : [], result.set_url)}>
                        <PartVisual src={result.set_img_url} name={result.name} />
                        <span>View photo</span>
                      </button>
                      <section>
                        <span>{result.set_num} · {result.year || "Unknown year"}</span>
                        <h3>{result.name}</h3>
                        <p>{result.num_parts.toLocaleString()} pieces · {result.kind === "minifig" ? "Minifigure" : (result.themeName || "LEGO set")}</p>
                      </section>
                      <button className="primary small" disabled={Boolean(addingSet)} onClick={() => addSearchResult(result)}>{addingSet === result.set_num ? "Loading…" : "Start check"}</button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {mocOpen && (
        <div className="modal-backdrop top-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !mocImporting) setMocOpen(false); }}>
          <section className="moc-modal" role="dialog" aria-modal="true" aria-labelledby="moc-import-title">
            <button className="modal-close" aria-label="Close MOC importer" disabled={mocImporting} onClick={() => setMocOpen(false)}>×</button>
            <p className="eyebrow">CUSTOM BRICKCHECK</p>
            <h2 id="moc-import-title">Import a Rebrickable MOC</h2>
            <p className="moc-modal-intro">Identify the MOC, then add its Rebrickable CSV inventory. BrickCheck will retrieve the part names, colors and images.</p>

            <div className="moc-form-grid">
              <label className="moc-field moc-reference-field">
                <span>Rebrickable URL or MOC ID</span>
                <input
                  value={mocReferenceInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    const reference = parseMocReference(value);
                    setMocReferenceInput(value);
                    if (reference) {
                      setMocName((current) => current || reference.suggestedName);
                      setMocImageUrl((current) => current || defaultMocImage(reference.id));
                      setMocError("");
                    }
                  }}
                  placeholder="MOC-262378 or https://rebrickable.com/mocs/…"
                />
              </label>
              <label className="moc-field">
                <span>MOC name</span>
                <input value={mocName} onChange={(event) => setMocName(event.target.value)} placeholder="The Batpod LOTDK" />
              </label>
              <label className="moc-field">
                <span>Cover image URL <small>Optional</small></span>
                <input value={mocImageUrl} onChange={(event) => setMocImageUrl(event.target.value)} placeholder="Rebrickable image address" />
              </label>
            </div>

            <section className={`moc-inventory-drop ${mocInventoryText ? "has-file" : ""}`}>
              <input ref={mocInventoryRef} className="hidden-input" type="file" accept=".csv,text/csv" onChange={readMocInventoryFile} />
              <div className="moc-file-mark">CSV</div>
              <div>
                <strong>{mocInventoryFileName || "Add the MOC inventory"}</strong>
                <span>{mocInventoryText ? (mocInventoryLotCount ? `${mocInventoryLotCount} part lots ready` : "CSV added — import to validate") : "On Rebrickable, open the MOC inventory and export it as Rebrickable CSV."}</span>
              </div>
              <button type="button" className="secondary compact" disabled={mocImporting} onClick={() => mocInventoryRef.current?.click()}>{mocInventoryText ? "Replace CSV" : "Choose CSV"}</button>
            </section>

            <details className="moc-paste-details">
              <summary>Or paste the CSV contents</summary>
              <textarea value={mocInventoryText} onChange={(event) => { setMocInventoryText(event.target.value); setMocInventoryFileName(""); setMocError(""); }} placeholder={'Part,Color,Quantity,Is Spare\n3001,0,4,False'} spellCheck={false} />
            </details>
            {mocError && <div className="inline-error">{mocError}</div>}
            <div className="moc-actions">
              {mocDraftReference && <a href={mocDraftReference.pageUrl} target="_blank" rel="noreferrer">Open MOC on Rebrickable ↗</a>}
              <button className="primary" disabled={mocImporting} onClick={() => void importMoc()}>{mocImporting ? "Loading parts…" : "Add to My Sets"}</button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop top-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button className="modal-close" aria-label="Close" onClick={() => setSettingsOpen(false)}>×</button>
            <div className="settings-icon">R</div>
            <p className="eyebrow">DATA SOURCE</p>
            <h2 id="settings-title">Connect Rebrickable</h2>
            <p>Rebrickable provides official set inventories, colors, minifigures and—most importantly—the part photos.</p>
            <label>
              <span>API key</span>
              <input type="password" value={apiDraft} onChange={(event) => setApiDraft(event.target.value)} placeholder="Paste your Rebrickable API key" />
            </label>
            <p className="privacy-note">Your key stays in this browser and is only sent to Rebrickable when you search or load an inventory.</p>
            <div className="theme-setting">
              <div>
                <strong>Appearance</strong>
                <span>Use the light or dark catalog theme.</span>
              </div>
              <div className="theme-switch" role="group" aria-label="Color theme">
                <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button>
                <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button>
              </div>
            </div>
            <div className="settings-actions">
              <a href="https://rebrickable.com/users/profile/" target="_blank" rel="noreferrer">Get a free key ↗</a>
              <button className="primary" onClick={saveApiKey}>{apiDraft.trim() ? "Save connection" : "Remove key"}</button>
            </div>
          </section>
        </div>
      )}

      {gallery && (
        <div className="modal-backdrop top-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setGallery(null); }}>
          <section className="gallery-modal" role="dialog" aria-modal="true" aria-label={`${gallery.title} image gallery`}>
            <button className="modal-close" aria-label="Close gallery" onClick={() => setGallery(null)}>×</button>
            <div className="gallery-stage">
              <img src={gallery.images[gallery.index]} alt={`${gallery.title} catalog view ${gallery.index + 1}`} />
              {gallery.images.length > 1 && (
                <>
                  <button className="gallery-arrow previous" aria-label="Previous image" onClick={() => setGallery((current) => current ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length } : null)}>‹</button>
                  <button className="gallery-arrow next" aria-label="Next image" onClick={() => setGallery((current) => current ? { ...current, index: (current.index + 1) % current.images.length } : null)}>›</button>
                </>
              )}
            </div>
            <div className="gallery-footer">
              <div><strong>{gallery.title}</strong><span>{gallery.index + 1} of {gallery.images.length} catalog {gallery.images.length === 1 ? "photo" : "photos"}</span></div>
              {gallery.externalUrl && <a href={gallery.externalUrl} target="_blank" rel="noreferrer">Open Rebrickable ↗</a>}
            </div>
            {gallery.images.length > 1 && (
              <div className="gallery-thumbnails">
                {gallery.images.map((image, index) => <button className={gallery.index === index ? "active" : ""} key={image} aria-label={`Show image ${index + 1}`} onClick={() => setGallery((current) => current ? { ...current, index } : null)}><img src={image} alt="" /></button>)}
              </div>
            )}
          </section>
        </div>
      )}

      {bricklinkXml && (
        <div className="modal-backdrop top-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setBricklinkXml(null); }}>
          <section className="bricklink-modal" role="dialog" aria-modal="true" aria-labelledby="bricklink-xml-title">
            <button className="modal-close" aria-label="Close BrickLink XML" onClick={() => setBricklinkXml(null)}>×</button>
            <p className="eyebrow">BRICKLINK WANTED LIST</p>
            <h2 id="bricklink-xml-title">Copy missing parts XML</h2>
            <p className="bricklink-copy-summary">
              {bricklinkXml.setNum} · {bricklinkXml.lotCount} lot{bricklinkXml.lotCount === 1 ? "" : "s"} · {bricklinkXml.pieceCount} piece{bricklinkXml.pieceCount === 1 ? "" : "s"}
            </p>
            <textarea
              ref={bricklinkXmlRef}
              className="bricklink-xml-output"
              aria-label="Generated BrickLink XML"
              value={bricklinkXml.xml}
              readOnly
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="bricklink-copy-actions">
              <p>Copy this text, then choose <strong>Upload BrickLink XML format</strong> on BrickLink.</p>
              <div>
                <a href="https://www.bricklink.com/v2/wanted/upload.page" target="_blank" rel="noreferrer">Open BrickLink ↗</a>
                <button className="primary" onClick={() => void copyBricklinkXml()}>Copy XML</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </div>
  );
}

function PartGroups({
  groups,
  view,
  onFound,
}: {
  groups: PartGroup[];
  view: ViewMode;
  onFound: (part: PartItem, value: number) => void;
}) {
  return (
    <div className="part-groups">
      {groups.map((partGroup) => (
        <section className="part-group" key={partGroup.label || "all-parts"}>
          {partGroup.label && (
            <div className="part-group-heading">
              <strong>{partGroup.label}</strong>
              <span>{partGroup.note ?? `${partGroup.parts.length} part lots`}</span>
            </div>
          )}
          <div className={`parts-${view}`}>
            {partGroup.parts.map((part) => (
              <PartCard key={part.id} part={part} view={view} onFound={(value) => onFound(part, value)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Counter({ found, quantity, onChange }: { found: number; quantity: number; onChange: (value: number) => void }) {
  return (
    <div className="counter" aria-label={`${found} of ${quantity} found`}>
      <button aria-label="Subtract one" disabled={found <= 0} onClick={() => onChange(found - 1)}>−</button>
      <strong>{found}<span>/{quantity}</span></strong>
      <button aria-label="Add one" disabled={found >= quantity} onClick={() => onChange(found + 1)}>＋</button>
    </div>
  );
}

function PartCard({ part, view, onFound }: { part: PartItem; view: ViewMode; onFound: (value: number) => void }) {
  const complete = part.found >= part.quantity;
  const cardRef = useRef<HTMLElement>(null);
  const changeFound = (value: number) => {
    if (value > part.found && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const card = cardRef.current;
      card?.getAnimations().forEach((animation) => animation.cancel());
      card?.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-3px)", offset: .42 },
          { transform: "translateY(1px)", offset: .72 },
          { transform: "translateY(0)" },
        ],
        { duration: 190, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
    }
    onFound(value);
  };
  return (
    <article
      ref={cardRef}
      className={`part-card ${view} ${complete ? "is-found" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Add one found ${part.name}. ${part.found} of ${part.quantity} found.`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        if (part.found < part.quantity) changeFound(part.found + 1);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if ((event.key === "Enter" || event.key === " ") && part.found < part.quantity) {
          event.preventDefault();
          changeFound(part.found + 1);
        }
      }}
    >
      <button className="image-check" aria-label={complete ? `Mark ${part.name} missing` : `Mark ${part.name} found`} onClick={() => changeFound(complete ? 0 : part.quantity)}>{complete ? "✓" : ""}</button>
      <div className="part-image">
        <PartVisual src={part.imageUrl} name={part.name} color={part.colorRgb} />
        {part.spare && <span className="spare-badge">SPARE</span>}
      </div>
      <div className="part-copy">
        <div className="part-id-line"><span className="color-dot" style={{ background: `#${part.colorRgb}` }} /><span className="part-number">{part.partNum}</span><span className="found-label">FOUND</span></div>
        <h3>{part.name}</h3>
        <p>{part.colorName}</p>
      </div>
      <Counter found={part.found} quantity={part.quantity} onChange={changeFound} />
    </article>
  );
}
