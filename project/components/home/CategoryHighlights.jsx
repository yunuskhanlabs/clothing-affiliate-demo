import Link from "next/link";
import Image from "next/image";
import Section, { SectionHeading } from "@/components/ui/Section";
import { getProductsByCategory } from "@/lib/products";

const GROUPS = [
  {
    category: "men",
    label: "Men",
    href: "/men",
    image: "/images/departments/men.jpg",
  },
  {
    category: "women",
    label: "Women",
    href: "/women",
    image: "/images/departments/women.jpg",
  },
  {
    category: "kids",
    label: "Kids",
    href: "/kids",
    image: "/images/departments/kids.jpg",
  },
];

export default function CategoryHighlights() {
  return (
    <Section id="shop-by-department">
      <SectionHeading eyebrow="Departments" title="Shop Men, Women & Kids" className="section-heading-mobile" />
      {/* category-highlights-grid: mobile overrides in globals.css → 3-col, tighter gap */}
      <div className="category-highlights-grid grid grid-cols-3 gap-2 lg:gap-4">
        {GROUPS.map((group) => (
          <Link
            key={group.category}
            href={group.href}
            /* category-highlights-card: mobile aspect-ratio 1/1; desktop slightly more compact 1/1 instead of 4/5 */
            className="category-highlights-card group relative aspect-[1/1] overflow-hidden rounded-sm border border-border bg-surface lg:aspect-[1/1]"
          >
            <Image
              src={group.image}
              alt={group.label}
              fill
              sizes="(max-width: 640px) 33vw, 33vw"
              className="object-cover transition-transform duration-500 ease-premium [@media(hover:hover)]:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 p-2 lg:p-5">
              <p className="font-display text-base italic text-paper lg:text-2xl">{group.label}</p>
              <p className="mt-0.5 hidden text-xs uppercase tracking-wide text-paper-muted lg:block">Shop the edit →</p>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

