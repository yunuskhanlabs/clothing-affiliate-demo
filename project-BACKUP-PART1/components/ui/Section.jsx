import Container from "./Container";

export function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-3 font-body text-xs font-semibold uppercase tracking-[0.2em] text-tag">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-section-head text-paper">{title}</h2>
        {description && (
          <p className="mt-2 max-w-xl text-sm text-paper-dim">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export default function Section({ id, className = "", children }) {
  return (
    <section id={id} className={`section ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}
