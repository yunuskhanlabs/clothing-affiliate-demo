"use client";

function Chip({ label, onRemove }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs text-paper transition-colors hover:border-tag"
    >
      {label}
      <span aria-hidden="true">✕</span>
      <span className="sr-only">Remove filter {label}</span>
    </button>
  );
}

/**
 * @param {object} props
 * @param {object} props.filters
 * @param {(patch: object) => void} props.onChange
 * @param {string[]} [props.hideKeys]
 */
export default function ActiveFilterChips({ filters, onChange, hideKeys = [] }) {
  const hidden = new Set(hideKeys);
  const chips = [];

  if (!hidden.has("category") && filters.category) {
    chips.push({ key: "category", label: filters.category, onRemove: () => onChange({ category: "" }) });
  }
  ["brand", "color", "size"].forEach((key) => {
    (filters[key] || []).forEach((value) => {
      chips.push({ key: `${key}:${value}`, label: value, onRemove: () => onChange({ [key]: filters[key].filter((v) => v !== value) }) });
    });
  });
  if (filters.price_min !== null || filters.price_max !== null) {
    const label = `₹${filters.price_min ?? 0} – ${filters.price_max ?? "∞"}`;
    chips.push({ key: "price", label, onRemove: () => onChange({ price_min: null, price_max: null }) });
  }
  if (filters.rating !== null) chips.push({ key: "rating", label: `${filters.rating}★ & up`, onRemove: () => onChange({ rating: null }) });
  if (filters.discount !== null) chips.push({ key: "discount", label: `${filters.discount}% off+`, onRemove: () => onChange({ discount: null }) });
  ["material", "fit", "occasion"].forEach((key) => {
    if (filters[key]) chips.push({ key, label: filters[key], onRemove: () => onChange({ [key]: "" }) });
  });
  if (filters.new) chips.push({ key: "new", label: "New", onRemove: () => onChange({ new: false }) });
  if (filters.trending) chips.push({ key: "trending", label: "Trending", onRemove: () => onChange({ trending: false }) });
  if (filters.bestseller) chips.push({ key: "bestseller", label: "Best Seller", onRemove: () => onChange({ bestseller: false }) });

  if (chips.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
    </div>
  );
}
