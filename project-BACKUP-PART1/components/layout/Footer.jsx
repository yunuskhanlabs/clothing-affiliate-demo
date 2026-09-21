import Link from "next/link";
import Container from "@/components/ui/Container";

const COLUMNS = [
  {
    heading: "Shop",
    links: [
      { label: "Men", href: "/men" },
      { label: "Women", href: "/women" },
      { label: "Kids", href: "/kids" },
      { label: "Deals", href: "/deals" },
    ],
  },
  {
    heading: "Categories",
    links: [
      { label: "Shirts", href: "/categories/shirts" },
      { label: "Footwear", href: "/categories/footwear" },
      { label: "Accessories", href: "/categories/accessories" },
      { label: "New Arrivals", href: "/new-arrivals" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Rove", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Affiliate Disclosure", href: "/affiliate-disclosure" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

const SOCIALS = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "Pinterest", href: "https://pinterest.com" },
  { label: "X", href: "https://x.com" },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-ink-soft">
      <Container className="py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="font-display text-2xl italic text-paper">
              Rove
            </Link>
            <p className="mt-4 max-w-[22ch] text-sm text-paper-dim">
              Curated men&apos;s fashion, discovered and compared across the web.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-paper-muted">
                {col.heading}
              </p>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="nav-link text-sm text-paper-dim hover:text-paper"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-6 border-t border-border pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-paper-dim">
            © {new Date().getFullYear()} Rove. As an affiliate, Rove may earn a commission
            from qualifying purchases made through links on this site.
          </p>
          <div className="flex items-center gap-5">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium uppercase tracking-wide text-paper-muted transition-colors hover:text-tag"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
