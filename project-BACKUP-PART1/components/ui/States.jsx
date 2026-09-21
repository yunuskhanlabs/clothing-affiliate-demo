export function LoadingState({ label = "Loading" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-16 text-paper-dim"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-tag" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-border py-16 text-center">
      <p className="font-display text-xl text-paper">{title}</p>
      {description && <p className="max-w-sm text-sm text-paper-dim">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again in a moment.",
  action,
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-sm border border-tag/40 bg-tag-soft/30 py-16 text-center"
    >
      <p className="font-display text-xl text-paper">{title}</p>
      <p className="max-w-sm text-sm text-paper-dim">{description}</p>
      {action}
    </div>
  );
}
