/**
 * URL query-state contract — Part 2 §19.
 *
 * The URL is the canonical, shareable representation of catalog state.
 * Every filter/sort control reads and writes through `parseFilters` /
 * `filtersToQueryString` — never through ad-hoc `URLSearchParams` calls
 * scattered across components. This keeps parameter names consistent
 * across `/products`, `/men`, `/women`, `/kids`, `/categories/[slug]`,
 * `/search`, and `/deals`.
 *
 * Recognized parameters:
 *   category      single value  — men | women | kids
 *   subcategory   single value  — e.g. t-shirts
 *   brand         comma list    — e.g. northline,marrow
 *   color         comma list    — e.g. black,white
 *   size          comma list    — e.g. m,l
 *   price_min     number
 *   price_max     number
 *   rating        number        — minimum rating (e.g. 4 = "4 & up")
 *   discount      number        — minimum discount percentage
 *   material      single value
 *   fit           single value
 *   occasion      single value
 *   new           "1"           — boolean flag
 *   trending      "1"           — boolean flag
 *   bestseller    "1"           — boolean flag
 *   q             string        — free-text search
 *   sort          enum          — see SORT_OPTIONS below
 *
 * Unknown/invalid parameters are ignored rather than thrown — a stale or
 * hand-edited URL must never crash the page (§19).
 */

export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "popular", label: "Popularity" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "discount", label: "Highest Discount" },
  { value: "rating", label: "Highest Rated" },
  { value: "newest", label: "Newest" },
];
const VALID_SORTS = new Set(SORT_OPTIONS.map((s) => s.value));

export const DEFAULT_FILTERS = {
  category: "",
  subcategory: "",
  brand: [],
  color: [],
  size: [],
  price_min: null,
  price_max: null,
  rating: null,
  discount: null,
  material: "",
  fit: "",
  occasion: "",
  new: false,
  trending: false,
  bestseller: false,
  q: "",
  sort: "relevance",
};

const LIST_KEYS = ["brand", "color", "size"];
const NUMBER_KEYS = ["price_min", "price_max", "rating", "discount"];
const SINGLE_KEYS = ["category", "subcategory", "material", "fit", "occasion"];
const BOOL_KEYS = ["new", "trending", "bestseller"];

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * @param {URLSearchParams | Record<string,string>} searchParams
 * @returns {typeof DEFAULT_FILTERS}
 */
export function parseFilters(searchParams) {
  const get = (key) => {
    if (!searchParams) return null;
    if (typeof searchParams.get === "function") return searchParams.get(key);
    return searchParams[key] ?? null;
  };

  const filters = { ...DEFAULT_FILTERS };

  SINGLE_KEYS.forEach((key) => {
    const raw = get(key);
    if (typeof raw === "string" && raw.trim()) filters[key] = raw.trim().toLowerCase();
  });

  LIST_KEYS.forEach((key) => {
    const raw = get(key);
    if (typeof raw === "string" && raw.trim()) {
      filters[key] = [...new Set(raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean))];
    }
  });

  NUMBER_KEYS.forEach((key) => {
    filters[key] = toNumberOrNull(get(key));
  });

  BOOL_KEYS.forEach((key) => {
    filters[key] = get(key) === "1";
  });

  const rawQ = get("q");
  if (typeof rawQ === "string") filters.q = rawQ;

  const rawSort = get("sort");
  filters.sort = typeof rawSort === "string" && VALID_SORTS.has(rawSort) ? rawSort : "relevance";

  return filters;
}

/**
 * Serializes a filters object back into a query string (no leading "?").
 * Empty/default values are omitted so URLs stay clean.
 */
export function filtersToQueryString(filters) {
  const params = new URLSearchParams();

  SINGLE_KEYS.forEach((key) => {
    if (filters[key]) params.set(key, filters[key]);
  });
  LIST_KEYS.forEach((key) => {
    if (filters[key]?.length) params.set(key, filters[key].join(","));
  });
  NUMBER_KEYS.forEach((key) => {
    if (filters[key] !== null && filters[key] !== undefined && filters[key] !== "") params.set(key, String(filters[key]));
  });
  BOOL_KEYS.forEach((key) => {
    if (filters[key]) params.set(key, "1");
  });
  if (filters.q) params.set("q", filters.q);
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);

  return params.toString();
}

export function countActiveFilters(filters) {
  let count = 0;
  LIST_KEYS.forEach((key) => (count += filters[key]?.length || 0));
  NUMBER_KEYS.forEach((key) => {
    if (filters[key] !== null && filters[key] !== undefined) count += 1;
  });
  SINGLE_KEYS.forEach((key) => {
    if (key === "category" || key === "subcategory") return; // route-level, not a "filter chip"
    if (filters[key]) count += 1;
  });
  BOOL_KEYS.forEach((key) => {
    if (filters[key]) count += 1;
  });
  return count;
}

export function clearFilters(filters) {
  return { ...DEFAULT_FILTERS, category: filters.category, subcategory: filters.subcategory, q: filters.q, sort: filters.sort };
}
