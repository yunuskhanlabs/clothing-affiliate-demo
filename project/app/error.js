"use client";

import { useEffect } from "react";
import Container from "@/components/ui/Container";
import Button from "@/components/ui/Button";
import { logError } from "@/lib/observability/logger";

/**
 * PART 6 §51 — a route-segment error boundary. Catches a render/data
 * error anywhere under the root layout and shows a safe recovery screen
 * INSTEAD of a blank white crash — the rest of the shell (Header/Footer,
 * from app/layout.js) keeps rendering, since Next.js only replaces the
 * failed segment, not the whole document, for a non-root error boundary
 * (§51 "do not let one failed component crash the entire application").
 *
 * §45: no stack trace, error message internals, or component name are
 * shown to the visitor — `error.message`/`error.digest` are logged
 * server-side-shaped (via `logError`, which itself only reaches a real
 * log sink; nothing here calls an endpoint that could leak this to a
 * third party) and never rendered into the DOM.
 */
export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    logError("route segment error", { digest: error?.digest, message: error?.message });
  }, [error]);

  return (
    <Container className="flex min-h-[60svh] flex-col items-center justify-center pt-24 text-center sm:pt-28">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-paper-muted">CLOXTRO</p>
      <h1 className="mt-3 font-display text-2xl text-paper">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm text-paper-dim">
        That didn&apos;t load the way it should have. It&apos;s been logged — try again, or head back to the homepage.
      </p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button as="a" href="/" variant="secondary">
          Back to CLOXTRO
        </Button>
      </div>
    </Container>
  );
}
