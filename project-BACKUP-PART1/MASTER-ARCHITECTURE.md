# Master Architecture — Rove (Fashion Discovery & Affiliate Platform)

This document describes the architecture **as it actually exists in the
code** after Part 1. Every later phase should read this before touching
anything.

## 1. Framework & build system

- **Next.js 14.2.35**, App Router (`app/`), JavaScript (no TypeScript yet —
  see "Open decisions" if a later phase wants to migrate).
- **Tailwind CSS 3.4** for styling. No CSS-in-JS, no separate CSS Modules
  except `app/globals.css` for tokens/base/utilities that don't fit Tailwind
  classes (focus rings, nav underline, section rhythm, reduced-motion).
- **Fonts**: self-hosted via `@fontsource/fraunces` and `@fontsource/inter`,
  imported in `app/layout.js`. Deliberately **not** `next/font/google` —
  that fetches from Google at build time, which fails in network-restricted
  environments (CI, sandboxes) and adds a runtime dependency on Google's
  CDN. Self-hosted packages avoid both.
- Package manager: npm. `package.json` lists exact dependency set — keep it
  minimal, every new dependency should earn its place.

## 2. Folder structure

```
app/
  layout.js          Root layout — fonts, metadata, <Header>/<Footer> shell
  page.js             Homepage — composes Hero + section shells
  globals.css         Design tokens (CSS vars), base styles, small utilities
                       Tailwind can't express cleanly (nav underline, focus
                       ring, reduced-motion, section divider rhythm)
components/
  ui/                 Framework-agnostic primitives, no page-specific logic
    Container.jsx
    Button.jsx
    Section.jsx       + SectionHeading
    States.jsx         LoadingState / EmptyState / ErrorState
  layout/             Structural chrome shared by every route
    Header.jsx         Sticky nav, mobile menu (client component)
    Footer.jsx
  home/               Homepage-specific composition
    Hero.jsx
    CategoryShell.jsx
    ProductGridShell.jsx     generic placeholder shell for any product rail
    PriceBandShell.jsx
    PersonalizedShell.jsx
```

**Rule for future phases:** page-specific components live under
`components/<domain>/` (e.g. `components/product/` for Part 2's product
detail page). Cross-page primitives go in `components/ui/`. Don't add
components directly under `components/` root.

## 3. Component architecture

- `components/ui/*` are the only components allowed to be purely
  presentational with no business logic — treat them as the design system.
- `ProductGridShell` is intentionally generic: it takes `eyebrow`, `title`,
  `description`, `viewAllHref`, and a `count` of skeleton cards. **Part 2
  should replace the internal `SkeletonCard` render with real product
  cards, not create a parallel grid component.** Product-card markup,
  image zoom, and hover behavior belong in a new `components/product/
  ProductCard.jsx` that `ProductGridShell` renders instead of the skeleton.
- `Header` and `Footer` are the only components that know about the full
  site nav. Anything wishlist/account-related in the header is a **link to
  a route**, not a real feature — Part 3/4 (auth, wishlist) should replace
  `href="/wishlist"` and `href="/account"` with real state without
  restructuring `Header.jsx`.

## 4. Routing strategy

- App Router, file-based. Only `/` exists after Part 1.
- Nav and footer link to routes that don't exist yet (`/men`, `/deals`,
  `/categories/shirts`, `/wishlist`, `/account`, etc.) — this is
  intentional. They 404 today; Part 2+ fills them in. Don't rename these
  paths without updating `Header.jsx` / `Footer.jsx`.
- Expected future route shape (not yet built): `/deals`, `/men`, `/women`,
  `/kids`, `/categories/[slug]`, `/product/[slug]`, `/wishlist`, `/account`,
  `/admin/*`.

## 5. Styling strategy & design tokens

All tokens are defined in `tailwind.config.js theme.extend`, sourced from
CSS custom properties where relevant (`--font-display`, `--font-body` in
`globals.css`). Don't hardcode hex values in components — extend the
token set in `tailwind.config.js` instead.

### Color tokens

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0E0E10` | Page background |
| `ink-soft` | `#141417` | Slightly-lifted background (footer) |
| `surface` | `#17171A` | Cards, skeleton blocks |
| `surface-raised` | `#1D1D21` | Nested surfaces |
| `border` | `#26262B` | Default hairline border |
| `border-strong` | `#333338` | Emphasized border (badges, secondary CTA) |
| `paper` | `#F2F0EC` | Primary text |
| `paper-muted` | `#C8C6C0` | Secondary text |
| `paper-dim` | `#8B8983` | Muted/tertiary text |
| `tag` | `#FF3D57` | Accent — CTAs, price/deal signaling, focus ring |
| `tag-hover` | `#FF5C73` | Accent hover state |
| `tag-soft` | `#3A1620` | Accent tint background (error/alert state) |

Chosen deliberately: a "price tag red" accent on a near-black ground,
paired with an editorial serif (Fraunces) for headings — reads as
fashion-magazine/deals-driven rather than generic SaaS. Avoid introducing
a second accent color; if a phase needs a semantic color (success,
warning), add it as a named token here, not an inline hex.

### Typography

- Display face: **Fraunces** (`font-display`) — used for H1/H2/hero only,
  set in italic for emphasis words. Never use for body copy or UI chrome.
- Body/UI face: **Inter** (`font-body`) — everything else, including nav
  and buttons (uppercase + letterspaced via utility classes, not a
  different font).
- Scale: `text-display-xl` (hero H1), `text-display-lg` (reserved for
  future large headings), `text-section-head` (section H2). Body sizes use
  default Tailwind scale (`text-sm`, `text-base`, etc).

### Responsive breakpoints

Default Tailwind breakpoints, used consistently: `sm` 640px, `lg` 1024px.
Container max-width is `max-w-content` (1360px), horizontal padding scales
`px-5 → sm:px-8 → lg:px-10`. Mobile-first: base classes target mobile,
overrides added at `sm:`/`lg:`.

### Animation conventions

- Standard easing: `ease-premium` = `cubic-bezier(0.4, 0, 0.2, 1)`.
- Standard duration: **0.3s** for interactive transitions (nav underline,
  sticky header, hover states, mobile menu icon).
- Entrance animations (hero text) use `animate-fade-up` (0.6s, staggered
  via inline `[animation-delay:_]` utility classes) — reserved for
  above-the-fold, page-load moments only. Don't reuse `fade-up` for
  scroll-triggered reveals; Part 2 should define its own scroll-reveal
  utility for product grids (see "Animation ownership" below) rather than
  repurpose this one, since the two need different trigger mechanisms
  (load vs. intersection observer).
- All continuous/ambient motion (hero mesh background) is wrapped in
  `motion-safe:` variants, and `globals.css` additionally forces
  `animation-duration: 0.001ms !important` under
  `prefers-reduced-motion: reduce` as a global safety net.

### Animation ownership (do not violate)

- **Part 1 owns**: header sticky transition, nav underline hover, hero text
  reveal, hero background drift, CTA hover/focus/active states, the global
  motion conventions above.
- **Part 2 owns**: product-card image zoom, product-card CTA slide-in,
  product-grid scroll reveal, product-card hover behavior. Implement these
  as new, separate CSS/utilities inside `components/product/` — do not
  edit the animations already defined in `Header.jsx`, `Hero.jsx`, or
  `globals.css`'s `.nav-link` rule to achieve them.

## 6. Naming conventions

- Components: PascalCase file + export (`Header.jsx`, `ProductGridShell.jsx`).
- Non-component modules (utils, config): kebab-case or camelCase file name,
  no JSX.
- Route segments: kebab-case (`/affiliate-disclosure`, `/new-arrivals`).
- Tailwind color/token names: kebab-case, semantic not literal (`tag`, not
  `red`; `surface-raised`, not `gray-800`).

## 7. Reusable components inventory

`Container`, `Button` (variants: `primary` / `secondary` / `ghost`),
`Section` + `SectionHeading`, `LoadingState` / `EmptyState` / `ErrorState`,
`Header`, `Footer`. Use these instead of re-implementing equivalents.

## 8. Future integration points

### Supabase (not yet integrated)

No data layer exists yet — all homepage sections render static
placeholders/skeletons. When Part 2/3 add Supabase:

- Add a `lib/supabase/` directory with a client factory (browser + server
  variants per Next.js App Router conventions).
- `ProductGridShell` should accept a `products` prop (array) instead of
  only a `count` — keep `count` as the skeleton fallback when `products`
  is undefined/loading, so the loading state stays intact.
- Expected tables (not yet created): `products`, `categories`, `brands`,
  `users`, `wishlist_items`, `price_history`, `affiliate_links`.

### Affiliate system (not yet implemented)

Future flow: `View Deal → Tracking → Affiliate Redirect → Merchant`. No
tracking, redirect route, or affiliate link resolution exists in Part 1.
When built, it should live behind a dedicated route (e.g.
`/go/[productSlug]`) rather than direct external links, so click tracking
has a single choke point.

### Authentication (not yet implemented)

`Header.jsx`'s account/wishlist icons currently link to `/account` and
`/wishlist` as plain routes with no session awareness. When auth ships,
swap the icon `href`/click-handler for real session state — the header
layout (icon position, sizing, mobile menu entries) is already built to
accommodate this without a redesign.

### Admin (Part 5, not yet implemented)

No admin routes or components exist. Expected to live under `/admin/*`
outside the main site layout (likely its own `app/admin/layout.js`).

## 9. Key architectural decisions

- **JavaScript, not TypeScript.** Kept Part 1 dependency-light; revisit if
  a later phase's data layer (Supabase types) makes TS worth the
  migration cost. If migrating, do it as its own PR before adding new
  features, not incrementally alongside new feature work.
- **App Router over Pages Router** — standard for new Next.js projects,
  required for the layout/server-component patterns later phases
  (Supabase server components, streaming product data) will want.
  Never mix in a `pages/` directory.
  - **No component library** (no shadcn/MUI/etc.) — the design system is
  small enough that Tailwind + the `components/ui/` primitives cover it.
  Don't introduce one without updating this document.
- **Self-hosted fonts** over `next/font/google` — see §1. If a later phase
  adds more font weights/styles, add the corresponding `@fontsource`
  import in `app/layout.js` rather than switching loaders.
- **All homepage sections are shells, not real product logic** — see
  Part 2 handoff notes in `PHASE-1-CONTEXT.md`. This was a deliberate
  scope boundary, not an oversight.
