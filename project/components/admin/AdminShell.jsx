"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/offers", label: "Offers" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/deals", label: "Deals" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/conversions", label: "Conversions" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/automation", label: "Automation" },
  { href: "/admin/ai", label: "AI" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * Professional, responsive admin chrome (§7) — visually distinct from
 * the storefront (dense sidebar layout vs. the public site's marketing
 * pages) but built from the same design tokens (`bg-ink`, `text-paper`,
 * `border-border`, `bg-tag` — see tailwind.config.js), so it still reads
 * as part of the same product, not a bolted-on external tool.
 */
export default function AdminShell({ adminEmail, children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <div className="min-h-screen bg-ink text-paper">
      {/* Topbar */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileOpen((v) => !v)} className="p-2 text-paper lg:hidden" aria-label="Toggle menu">
            ☰
          </button>
          <Link href="/admin" className="font-display text-lg italic text-paper">
            Affiliate Demo <span className="text-tag">Admin</span>
          </Link>
        </div>
        <div className="flex items-center gap-4 text-xs text-paper-dim">
          <Link href="/" className="hover:text-paper">
            ← Storefront
          </Link>
          <span className="hidden sm:inline">{adminEmail}</span>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — desktop */}
        <nav className="hidden w-56 shrink-0 border-r border-border p-4 lg:block">
          <AdminNavLinks nav={NAV} isActive={isActive} />
        </nav>

        {/* Sidebar — mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink/80" onClick={() => setMobileOpen(false)} />
            <nav className="absolute inset-y-0 left-0 w-64 border-r border-border bg-ink p-4">
              <AdminNavLinks nav={NAV} isActive={isActive} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function AdminNavLinks({ nav, isActive, onNavigate }) {
  return (
    <ul className="flex flex-col gap-1">
      {nav.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-sm px-3 py-2 text-sm transition-colors ${
              isActive(item) ? "bg-tag text-ink font-semibold" : "text-paper-muted hover:bg-surface hover:text-paper"
            }`}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
