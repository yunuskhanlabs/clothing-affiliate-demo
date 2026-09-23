import Container from "@/components/ui/Container";
import Button from "@/components/ui/Button";

// PART 6 §52 empty state, §4: a 404 must never be indexed.
export const metadata = { robots: { index: false, follow: false }, title: "Page not found — Affiliate Demo" };

export default function NotFound() {
  return (
    <Container className="flex min-h-[60svh] flex-col items-center justify-center pt-24 text-center sm:pt-28">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-paper-muted">Affiliate Demo</p>
      <h1 className="mt-3 font-display text-2xl text-paper">We couldn&apos;t find that page</h1>
      <p className="mt-3 max-w-md text-sm text-paper-dim">
        It may have been moved, archived, or the link was mistyped. Try the homepage, or search the catalog.
      </p>
      <div className="mt-8 flex gap-3">
        <Button as="a" href="/">
          Back to Affiliate Demo
        </Button>
        <Button as="a" href="/search" variant="secondary">
          Search
        </Button>
      </div>
    </Container>
  );
}
