"use client";

/**
 * Minimal styled primitives reused by the four auth pages (§22 "Integrate
 * authentication with the existing design system... do not redesign the
 * entire site"). Copies the exact input styling already used in
 * `FilterPanel`'s price inputs, rather than introducing a new visual
 * language.
 */

export function AuthField({ label, error, ...inputProps }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-paper-muted">{label}</span>
      <input
        {...inputProps}
        className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag"
      />
      {error && (
        <span role="alert" className="text-xs text-tag">
          {error}
        </span>
      )}
    </label>
  );
}

export function AuthFormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm border border-tag/40 bg-tag-soft/30 px-3 py-2 text-sm text-paper">
      {message}
    </p>
  );
}

export function AuthFormSuccess({ message }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm text-paper">
      {message}
    </p>
  );
}
