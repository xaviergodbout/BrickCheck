const API_ROOT = "https://rebrickable.com/api/v3";
const CACHE_LIMIT = 100;
const CACHE_TTL = 10 * 60_000;

/** Memory-only catalog cache. API keys and catalog payloads never enter persisted caches. */
export function createCatalogClient(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { at: number; data: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  let currentKey = "";
  async function request(path: string, key: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const url = new URL(path.startsWith("http") ? path : `${API_ROOT}${path}`);
    if (url.origin !== "https://rebrickable.com" || !url.pathname.startsWith("/api/v3/")) {
      throw new Error("Invalid Rebrickable catalog address.");
    }
    const credential = key.trim();
    if (!credential) throw new Error("Connect Rebrickable to load the catalog.");
    if (credential !== currentKey) { cache.clear(); pending.clear(); currentKey = credential; }
    const cached = cache.get(url.href);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
    if (!signal && pending.has(url.href)) return pending.get(url.href)!;
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException("The catalog took too long to respond. Try again.", "TimeoutError")), 25_000);
    const work = (async () => {
      try {
        const response = await fetcher(url.href, { headers: { Authorization: `key ${credential}` }, signal: controller.signal });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error("That API key was not accepted. Check it in Settings.");
          if (response.status === 404) throw new Error("That catalog item could not be found.");
          if (response.status === 429) throw new Error("Rebrickable is receiving too many requests. Wait a moment, then try again.");
          throw new Error("Rebrickable is unavailable right now. Your saved checks are still available.");
        }
        const data: unknown = await response.json();
        signal?.throwIfAborted();
        if (credential === currentKey) {
          cache.delete(url.href);
          cache.set(url.href, { at: Date.now(), data });
          while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        }
        return data;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    })();
    if (signal) return work;
    pending.set(url.href, work);
    try { return await work; }
    finally { if (pending.get(url.href) === work) pending.delete(url.href); }
  }
  async function list(path: string, key: string, maxResults = Infinity, signal?: AbortSignal) {
    const results: unknown[] = [];
    const visited = new Set<string>();
    let next: string | null = path;
    while (next && results.length < maxResults) {
      signal?.throwIfAborted();
      if (visited.has(next)) throw new Error("The catalog returned a repeated page. Please try again.");
      visited.add(next);
      const page = await request(next, key, signal) as { results?: unknown[]; next?: string | null };
      results.push(...(page.results ?? []));
      next = page.next ?? null;
    }
    return results.slice(0, maxResults);
  }
  return { request, list };
}

const catalog = createCatalogClient();
export const rebrickableList = catalog.list;
