"use client";

import { useFacets } from "@/lib/hooks/useFacets";

const RATING_OPTIONS = [4, 3, 2];
const DISCOUNT_OPTIONS = [10, 30, 50];
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"];

function FilterGroup({ title, children, defaultOpen = true }) {
  return (
    <details className="border-b border-border py-4" open={defaultOpen}>
      <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.15em] text-paper-muted marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Toggle({ pressed, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-sm border px-3 py-1.5 text-xs transition-colors duration-300 ${
        pressed ? "border-tag bg-tag text-ink" : "border-border-strong text-paper-muted hover:border-paper hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-paper-muted hover:text-paper">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded-sm border-border-strong bg-transparent text-tag accent-tag focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag"
      />
      {label}
    </label>
  );
}

/**
 * @param {object} props
 * @param {object} props.filters
 * @param {(patch: object) => void} props.onChange
 * @param {() => void} props.onClearAll
 * @param {string[]} [props.hideKeys] - keys the current route fixes and shouldn't expose (e.g. "category" on /men)
 */
export default function FilterPanel({ filters, onChange, onClearAll, hideKeys = [] }) {
  const FACETS = useFacets();
  const hidden = new Set(hideKeys);
  const toggleListValue = (key, value) => {
    const current = filters[key] || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ [key]: next });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-lg text-paper">Filters</p>
        <button type="button" onClick={onClearAll} className="text-xs uppercase tracking-wide text-tag hover:text-tag-hover">
          Clear all
        </button>
      </div>

      {!hidden.has("category") && (
        <FilterGroup title="Department">
          <div className="flex flex-col gap-1">
            {["men", "women", "kids"].map((cat) => (
              <Checkbox
                key={cat}
                checked={filters.category === cat}
                onChange={() => onChange({ category: filters.category === cat ? "" : cat })}
                label={cat[0].toUpperCase() + cat.slice(1)}
              />
            ))}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title="Price">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            onChange({
              price_min: form.min.value ? Number(form.min.value) : null,
              price_max: form.max.value ? Number(form.max.value) : null,
            });
          }}
        >
          <input
            name="min"
            type="number"
            min="0"
            defaultValue={filters.price_min ?? ""}
            placeholder="Min"
            className="w-full rounded-sm border border-border-strong bg-transparent px-2 py-1.5 text-sm text-paper placeholder:text-paper-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag"
          />
          <span className="text-paper-dim">–</span>
          <input
            name="max"
            type="number"
            min="0"
            defaultValue={filters.price_max ?? ""}
            placeholder="Max"
            className="w-full rounded-sm border border-border-strong bg-transparent px-2 py-1.5 text-sm text-paper placeholder:text-paper-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag"
          />
          <button type="submit" className="shrink-0 rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:border-paper hover:text-paper">
            Go
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Toggle pressed={filters.price_max === 499} onClick={() => onChange({ price_min: null, price_max: filters.price_max === 499 ? null : 499 })}>
            Under ₹499
          </Toggle>
          <Toggle pressed={filters.price_max === 999} onClick={() => onChange({ price_min: null, price_max: filters.price_max === 999 ? null : 999 })}>
            Under ₹999
          </Toggle>
        </div>
      </FilterGroup>

      <FilterGroup title="Size">
        <div className="flex flex-wrap gap-2">
          {SIZE_OPTIONS.map((size) => (
            <Toggle key={size} pressed={filters.size?.includes(size.toLowerCase())} onClick={() => toggleListValue("size", size.toLowerCase())}>
              {size}
            </Toggle>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Color">
        <div className="flex flex-wrap gap-2">
          {FACETS.colors.map((c) => {
            const active = filters.color?.includes(c.name.toLowerCase());
            return (
              <button
                key={c.name}
                type="button"
                aria-pressed={active}
                aria-label={c.name}
                title={c.name}
                onClick={() => toggleListValue("color", c.name.toLowerCase())}
                className={`h-7 w-7 rounded-full border-2 transition-transform duration-300 ${active ? "border-tag scale-110" : "border-border-strong"}`}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Brand" defaultOpen={false}>
        <div className="flex flex-col gap-1">
          {FACETS.brands.map((brand) => (
            <Checkbox
              key={brand}
              checked={filters.brand?.includes(brand.toLowerCase())}
              onChange={() => toggleListValue("brand", brand.toLowerCase())}
              label={brand}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Rating" defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          {RATING_OPTIONS.map((r) => (
            <Toggle key={r} pressed={filters.rating === r} onClick={() => onChange({ rating: filters.rating === r ? null : r })}>
              {r}★ & up
            </Toggle>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Discount" defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          {DISCOUNT_OPTIONS.map((d) => (
            <Toggle key={d} pressed={filters.discount === d} onClick={() => onChange({ discount: filters.discount === d ? null : d })}>
              {d}% +
            </Toggle>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Material" defaultOpen={false}>
        <div className="flex flex-col gap-1">
          {FACETS.materials.map((m) => (
            <Checkbox key={m} checked={filters.material === m.toLowerCase()} onChange={() => onChange({ material: filters.material === m.toLowerCase() ? "" : m.toLowerCase() })} label={m} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Fit" defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          {FACETS.fits.map((f) => (
            <Toggle key={f} pressed={filters.fit === f.toLowerCase()} onClick={() => onChange({ fit: filters.fit === f.toLowerCase() ? "" : f.toLowerCase() })}>
              {f}
            </Toggle>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Occasion" defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
          {FACETS.occasions.map((o) => (
            <Toggle key={o} pressed={filters.occasion === o.toLowerCase()} onClick={() => onChange({ occasion: filters.occasion === o.toLowerCase() ? "" : o.toLowerCase() })}>
              {o}
            </Toggle>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="More" defaultOpen={false}>
        <div className="flex flex-col gap-1">
          <Checkbox checked={filters.new} onChange={() => onChange({ new: !filters.new })} label="New" />
          <Checkbox checked={filters.trending} onChange={() => onChange({ trending: !filters.trending })} label="Trending" />
          <Checkbox checked={filters.bestseller} onChange={() => onChange({ bestseller: !filters.bestseller })} label="Best Seller" />
        </div>
      </FilterGroup>
    </div>
  );
}
