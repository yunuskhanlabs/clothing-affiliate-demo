import Link from "next/link";

/**
 * @param {{ label: string, href?: string }[]} items - last item is treated as current page (no link)
 */
export default function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 overflow-x-auto whitespace-nowrap">
      <ol className="flex items-center gap-2 text-xs text-paper-dim">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">/</span>}
              {isLast || !item.href ? (
                <span className={isLast ? "text-paper" : ""} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="nav-link hover:text-paper inline-flex items-center justify-center min-h-[28px] min-w-[28px] -my-1 px-2 -mx-2">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
