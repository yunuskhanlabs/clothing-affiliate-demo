import Link from "next/link";
import Section, { SectionHeading } from "@/components/ui/Section";

const PLACEHOLDER_CATEGORIES = [
  { label: "Shirts", href: "/categories/shirts" },
  { label: "T-Shirts", href: "/categories/t-shirts" },
  { label: "Footwear", href: "/categories/footwear" },
  { label: "Bottoms", href: "/categories/bottoms" },
  { label: "Outerwear", href: "/categories/outerwear" },
  { label: "Accessories", href: "/categories/accessories" },
];

export default function CategoryShell() {
  return (
    <Section id="categories">
      <SectionHeading eyebrow="Browse" title="Shop by category" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {PLACEHOLDER_CATEGORIES.map((cat) => (
          <Link
            key={cat.href}
            href={cat.href}
            className="group flex flex-col items-center gap-3 rounded-sm border border-border bg-surface px-4 py-8 text-center transition-colors duration-300 hover:border-tag"
          >
            <span className="h-10 w-10 rounded-full bg-surface-raised transition-colors duration-300 group-hover:bg-tag/20" />
            <span className="text-sm font-medium text-paper-muted transition-colors duration-300 group-hover:text-paper">
              {cat.label}
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}
