import Container from "@/components/ui/Container";
import Button from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="relative flex min-h-[92svh] items-center overflow-hidden bg-ink pt-16 sm:pt-20">
      <HeroBackground />

      <Container className="relative z-10">
        <div className="max-w-3xl">
          <p
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-strong px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-paper-muted opacity-0 [animation-delay:0ms] animate-fade-up"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-tag" aria-hidden="true" />
            Deals, curated daily
          </p>

          <h1 className="font-display text-display-xl text-paper opacity-0 [animation-delay:120ms] animate-fade-up">
            Fashion worth
            <br />
            <span className="italic text-tag">seeking out.</span>
          </h1>

          <p className="mt-6 max-w-lg text-base text-paper-muted sm:text-lg opacity-0 [animation-delay:320ms] animate-fade-up">
            Rove tracks the internet&apos;s best menswear so you don&apos;t have to —
            trending pieces, real price drops, and new arrivals, gathered in one place.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4 opacity-0 [animation-delay:480ms] animate-fade-up">
            <Button href="/deals" as="link" variant="primary">
              Shop Now
            </Button>
            <Button href="/deals" as="link" variant="secondary">
              Today&apos;s Deals
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-1/4 -top-1/4 h-[60vw] w-[60vw] rounded-full bg-tag/20 blur-[120px] motion-safe:animate-mesh-drift" />
      <div className="absolute -right-1/4 -bottom-1/3 h-[55vw] w-[55vw] rounded-full bg-paper/[0.06] blur-[130px] motion-safe:animate-mesh-drift-reverse" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#F2F0EC 1px, transparent 1px), linear-gradient(90deg, #F2F0EC 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </div>
  );
}
