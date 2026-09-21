import Container from "@/components/ui/Container";

function Line({ className = "" }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-sm bg-surface-raised ${className}`} />;
}

/** Matches the product-detail layout so streamed server data cannot shift it. */
export default function ProductDetailLoading() {
  return (
    <Container className="pt-28 sm:pt-32">
      <Line className="mb-8 h-3 w-48" />
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <div aria-hidden="true" className="aspect-[3/4] w-full animate-pulse rounded-sm bg-surface-raised" />
          <div className="mt-3 flex gap-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 w-12 animate-pulse rounded-sm bg-surface-raised sm:h-20 sm:w-16" />
            ))}
          </div>
        </div>
        <div className="pt-1">
          <Line className="h-3 w-20" />
          <Line className="mt-3 h-9 w-4/5" />
          <Line className="mt-4 h-5 w-28" />
          <Line className="mt-5 h-8 w-44" />
          <div className="mt-7 space-y-3">
            <Line className="h-3 w-16" />
            <div className="flex gap-2">{Array.from({ length: 4 }).map((_, index) => <Line key={index} className="h-9 w-9 rounded-full" />)}</div>
            <Line className="mt-5 h-3 w-12" />
            <div className="flex gap-2">{Array.from({ length: 5 }).map((_, index) => <Line key={index} className="h-10 w-12" />)}</div>
          </div>
          <Line className="mt-8 h-11 w-full max-w-sm" />
          <Line className="mt-8 h-4 w-full" />
          <Line className="mt-2 h-4 w-5/6" />
        </div>
      </div>
    </Container>
  );
}
