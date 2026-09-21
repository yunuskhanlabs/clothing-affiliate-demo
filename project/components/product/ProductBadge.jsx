export default function ProductBadge({ label, tone = "default" }) {
  const tones = {
    default: "bg-surface/90 text-paper border border-border-strong",
    deal: "bg-tag text-ink",
  };
  return (
    <span className={`rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm ${tones[tone] || tones.default}`}>
      {label}
    </span>
  );
}
