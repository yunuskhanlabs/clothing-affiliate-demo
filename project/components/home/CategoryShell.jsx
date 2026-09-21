import Link from "next/link";
import Image from "next/image";
import Section, { SectionHeading } from "@/components/ui/Section";
import { getTaxonomy } from "@/lib/products";

const BROWSE_CATEGORIES = [
  {
    slug: "shirts",
    name: "Shirts",
    href: "/categories/shirts",
    image: "/images/categories/shirts.jpg",
  },
  {
    slug: "t-shirts",
    name: "T-Shirts",
    href: "/categories/t-shirts",
    image: "/images/categories/t-shirts.jpg",
  },
  {
    slug: "dresses",
    name: "Dresses",
    href: "/categories/dresses",
    image: "/images/categories/dresses.jpg",
  },
  {
    slug: "hoodies",
    name: "Hoodies",
    href: "/categories/hoodies",
    image: "/images/categories/hoodies.jpg",
  },
];

export default async function CategoryShell() {
  const tree = await getTaxonomy();
  const seen = new Map();
  Object.values(tree).forEach((subs) => subs.forEach((s) => seen.set(s.slug, s.name)));

  const categories = BROWSE_CATEGORIES.map((cat) => ({
    ...cat,
    name: seen.get(cat.slug) || cat.name,
  }));

  return (
    <Section id="categories">
      <SectionHeading eyebrow="Browse" title="Shop by category" />
      {/* Mobile: 2-column x 2-row compact layout; Desktop: 4 columns, compact balanced cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-5xl lg:mx-auto lg:gap-4">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={cat.href}
            className="group flex items-center gap-3 rounded-sm border border-border bg-surface p-2.5 sm:flex-col sm:justify-center sm:gap-3 sm:p-5 lg:py-6 lg:px-4 lg:gap-3.5 text-left sm:text-center transition-colors duration-300 hover:border-tag"
          >
            <div className="relative h-11 w-11 sm:h-16 sm:w-16 lg:h-24 lg:w-24 overflow-hidden rounded-full shrink-0">
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 640px) 44px, (max-width: 1024px) 64px, 96px"
                className="object-cover transition-transform duration-500 ease-premium [@media(hover:hover)]:group-hover:scale-105"
              />
            </div>
            <span className="text-xs sm:text-sm lg:text-base font-medium text-paper-muted transition-colors duration-300 group-hover:text-paper">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

