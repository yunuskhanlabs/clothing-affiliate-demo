/**
 * Lightweight compliance micro-copy, not final legal language — see
 * §28. Reused on product detail pages, deals sections, and near CTA
 * clusters. Kept as one tiny component so the exact copy can be revised
 * from a single place later.
 */
export default function AffiliateDisclosure({ className = "" }) {
  return (
    <p className={`text-xs leading-relaxed text-paper-dim ${className}`}>
      Affiliate disclosure: we may earn a commission on qualifying purchases made through links on this page, at no
      extra cost to you.
    </p>
  );
}
