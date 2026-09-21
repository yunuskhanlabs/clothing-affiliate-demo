"use client";

export function ColorSelector({ colors, selected, onSelect }) {
  if (!colors?.length) return null;
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-paper-muted">
        Color{selected ? `: ${selected.name}` : ""}
      </legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const active = selected?.name === c.name;
          return (
            <button
              key={c.name}
              type="button"
              aria-pressed={active}
              aria-label={c.name}
              title={c.name}
              onClick={() => onSelect(c)}
              className={`h-9 w-9 rounded-full border-2 transition-transform duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag focus-visible:outline-offset-2 ${
                active ? "border-tag scale-110" : "border-border-strong hover:scale-105"
              }`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

export function SizeSelector({ sizes, selected, onSelect }) {
  if (!sizes?.length) return null;
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-paper-muted">
        Size{selected ? `: ${selected}` : ""}
      </legend>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const active = selected === size;
          return (
            <button
              key={size}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(size)}
              className={`min-w-[2.75rem] rounded-sm border px-3 py-2 text-xs font-semibold transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag ${
                active ? "border-tag bg-tag text-ink" : "border-border-strong text-paper-muted hover:border-paper hover:text-paper"
              }`}
            >
              {size}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
