import { Suspense } from "react";
import Link from "next/link";
import Container from "@/components/ui/Container";
import Section, { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import CatalogView from "@/components/catalog/CatalogView";
import AffiliateDisclosure from "@/components/product/AffiliateDisclosure";

export const metadata = {
  title: "Deals — CLOXTRO",
  description: "Today's best discounts across Men, Women and Kids fashion.",
  alternates: { canonical: "/deals" }, // §7: the quick-link discount/price-max query variants stay unindexed-by-omission (never linked from anywhere else, not disallowed outright) rather than canonicalized away, matching §8's deep-linking rule
};

const QUICK_LINKS = [
  { label: "50%+ OFF", href: "/deals?discount=50" },
  { label: "Under ₹499", href: "/deals?price_max=499" },
  { label: "Under ₹999", href: "/deals?price_max=999" },
];

const COMING_SOON = [
  { title: "Flash Deals", description: "Time-boxed drops, refreshed throughout the day. Ships with the automated price-feed system in a later phase." },
  { title: "Limited-Time Deals", description: "Countdown-driven offers tied to merchant campaigns — connects once affiliate feeds are live." },
  { title: "Price Drops", description: "Automatic price-drop detection on items you've viewed or saved. Needs the tracking backend from a later phase." },
];

export default function DealsPage() {
  return (
    <>
      <Container className="pb-4 pt-24 sm:pt-28">
        <SectionHeading eyebrow="Save" title="Today's best deals" description="Real discounts, pulled from the current catalog." />

        <div className="mb-8 flex flex-wrap gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-full border border-border-strong px-4 py-2 text-xs font-semibold uppercase tracking-wide text-paper-muted transition-colors duration-300 hover:border-tag hover:text-paper"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <AffiliateDisclosure className="mb-8" />

        <Suspense fallback={<LoadingState label="Loading deals" />}>
          <CatalogView basePath="/deals" dealsOnly />
        </Suspense>
      </Container>

      <Section id="deals-coming-soon">
        <SectionHeading eyebrow="Coming soon" title="More ways to save" />
        <div className="grid gap-4 sm:grid-cols-3">
          {COMING_SOON.map((item) => (
            <div key={item.title} className="rounded-sm border border-dashed border-border p-5">
              <p className="font-display text-lg text-paper">{item.title}</p>
              <p className="mt-2 text-sm text-paper-dim">{item.description}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
