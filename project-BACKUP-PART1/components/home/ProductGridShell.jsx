import Section, { SectionHeading } from "@/components/ui/Section";
import Button from "@/components/ui/Button";

/**
 * Placeholder shell for a future product grid section (Part 2).
 * Renders the section chrome — eyebrow, heading, "view all" action, and a
 * skeleton-card row — so spacing/typography stay consistent once real
 * product cards and data are wired in.
 */
export default function ProductGridShell({
  id,
  eyebrow,
  title,
  description,
  viewAllHref = "/deals",
  count = 4,
}) {
  return (
    <Section id={id}>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <Button as="link" href={viewAllHref} variant="ghost" className="normal-case">
            View all →
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </Section>
  );
}

function SkeletonCard() {
  return (
    <div className="group">
      <div className="aspect-[3/4] w-full animate-pulse rounded-sm bg-surface-raised" />
      <div className="mt-3 h-3 w-3/4 animate-pulse rounded-sm bg-surface-raised" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded-sm bg-surface-raised" />
    </div>
  );
}
