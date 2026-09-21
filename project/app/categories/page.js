import Link from "next/link";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { getTaxonomy } from "@/lib/products";

export const metadata = {
  title: "Categories — CLOXTRO",
  description: "Browse every clothing category CLOXTRO tracks.",
  alternates: { canonical: "/categories" },
  openGraph: { title: "Categories — CLOXTRO", description: "Browse every clothing category CLOXTRO tracks.", url: "/categories" },
};

export default async function CategoriesPage() {
  const tree = await getTaxonomy();
  const seen = new Map();
  Object.values(tree).forEach((subs) => subs.forEach((s) => seen.set(s.slug, s.name)));

  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Browse" title="All categories" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[...seen.entries()].map(([slug, name]) => (
          <Link
            key={slug}
            href={`/categories/${slug}`}
            className="group flex flex-col items-center gap-3 rounded-sm border border-border bg-surface px-4 py-10 text-center transition-colors duration-300 hover:border-tag"
          >
            <span className="h-10 w-10 rounded-full bg-surface-raised transition-colors duration-300 group-hover:bg-tag/20" />
            <span className="text-sm font-medium text-paper-muted transition-colors duration-300 group-hover:text-paper">
              {name}
            </span>
          </Link>
        ))}
      </div>
    </Container>
  );
}
