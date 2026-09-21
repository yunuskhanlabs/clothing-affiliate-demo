import Link from "next/link";
import Section from "@/components/ui/Section";

const BANDS = [
  { label: "Under ₹499", href: "/deals?max=499" },
  { label: "Under ₹999", href: "/deals?max=999" },
];

export default function PriceBandShell() {
  return (
    <Section id="price-bands">
      <div className="grid gap-5 sm:grid-cols-2">
        {BANDS.map((band) => (
          <Link
            key={band.href}
            href={band.href}
            className="group relative overflow-hidden rounded-sm border border-border bg-surface px-8 py-12 transition-colors duration-300 hover:border-tag"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tag">
              Price drop
            </p>
            <p className="mt-3 font-display text-3xl italic text-paper">{band.label}</p>
            <p className="mt-2 text-sm text-paper-dim">Shop the full range →</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}
