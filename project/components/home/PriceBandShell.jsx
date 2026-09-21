import Link from "next/link";
import Section from "@/components/ui/Section";

const BANDS = [
  { label: "Under ₹499", href: "/deals?price_max=499" },
  { label: "Under ₹999", href: "/deals?price_max=999" },
];

export default function PriceBandShell() {
  return (
    <Section id="price-bands">
      <div className="grid grid-cols-2 gap-3 lg:gap-5">
        {BANDS.map((band) => (
          <Link
            key={band.href}
            href={band.href}
            className="group relative overflow-hidden rounded-sm border border-border bg-surface px-4 py-5 lg:px-8 lg:py-12 transition-colors duration-300 hover:border-tag"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tag">
              Price drop
            </p>
            <p className="mt-2 font-display text-xl lg:text-3xl italic text-paper">{band.label}</p>
            <p className="mt-1 text-xs lg:text-sm text-paper-dim">Shop the full range →</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

