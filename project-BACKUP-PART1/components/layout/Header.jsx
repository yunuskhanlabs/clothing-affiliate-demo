"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Container from "@/components/ui/Container";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Men", href: "/men" },
  { label: "Women", href: "/women" },
  { label: "Kids", href: "/kids" },
  { label: "Categories", href: "/categories" },
  { label: "Deals", href: "/deals" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          setScrolled(window.scrollY > 24);
          ticking.current = false;
        });
        ticking.current = true;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-premium ${
        scrolled
          ? "bg-ink/90 backdrop-blur-md border-b border-border shadow-[0_1px_0_0_rgba(0,0,0,0.4)]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <Container className="flex h-16 items-center justify-between sm:h-20">
        <Link
          href="/"
          className="font-display text-xl italic tracking-tight text-paper sm:text-2xl"
        >
          Rove
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link font-body text-sm font-medium uppercase tracking-wide text-paper-muted hover:text-paper"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <IconButton label="Search" href="/search">
            <SearchIcon />
          </IconButton>
          <IconButton label="Wishlist" href="/wishlist" className="hidden sm:inline-flex">
            <HeartIcon />
          </IconButton>
          <IconButton label="Account" href="/account" className="hidden sm:inline-flex">
            <UserIcon />
          </IconButton>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-sm text-paper transition-colors hover:text-tag lg:hidden"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </Container>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}

function IconButton({ label, href, children, className = "" }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-sm text-paper transition-colors duration-300 hover:text-tag ${className}`}
    >
      {children}
    </Link>
  );
}

function MobileNav({ open, onClose }) {
  return (
    <div
      id="mobile-nav"
      className={`fixed inset-0 top-16 z-40 bg-ink transition-opacity duration-300 ease-premium lg:hidden sm:top-20 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Container className="flex flex-col gap-1 py-8">
        {NAV_LINKS.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="border-b border-border py-4 font-display text-2xl text-paper transition-colors hover:text-tag"
            style={{ transitionDelay: open ? `${i * 40}ms` : "0ms" }}
          >
            {link.label}
          </Link>
        ))}
        <div className="mt-6 flex items-center gap-6 text-paper-muted">
          <Link href="/wishlist" onClick={onClose} className="text-sm uppercase tracking-wide">
            Wishlist
          </Link>
          <Link href="/account" onClick={onClose} className="text-sm uppercase tracking-wide">
            Account
          </Link>
        </div>
      </Container>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13.5 13.5L17.5 17.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 18" fill="none" aria-hidden="true">
      <path
        d="M10 17S1.5 12.1 1.5 6.4C1.5 3.5 3.8 1.5 6.4 1.5c1.6 0 3 .8 3.6 2 .6-1.2 2-2 3.6-2 2.6 0 4.9 2 4.9 4.9C18.5 12.1 10 17 10 17Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true">
      <circle cx="9.5" cy="5.8" r="3.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 17c1.4-3.4 4-5 7-5s5.6 1.6 7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function MenuIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <line
        x1="3" y1={open ? "11" : "6"} x2="19" y2={open ? "11" : "6"}
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        className="transition-all duration-300 ease-premium"
        style={open ? { transform: "rotate(45deg)", transformOrigin: "11px 11px" } : undefined}
      />
      <line
        x1="3" y1="16" x2="19" y2={open ? "11" : "16"}
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        className="transition-all duration-300 ease-premium"
        style={open ? { transform: "rotate(-45deg)", transformOrigin: "11px 11px" } : undefined}
      />
    </svg>
  );
}
