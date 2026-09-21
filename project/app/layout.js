import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/500-italic.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { WishlistProvider } from "@/lib/wishlist/WishlistProvider";
import { SITE_URL } from "@/lib/seo/site";
import { organizationSchema, websiteSchema } from "@/lib/seo/schema";
import NextTopLoader from 'nextjs-toploader';

export const metadata = {
  // PART 6 §7, §69: every relative `metadata.openGraph.url` / route-level
  // `alternates.canonical` in this app resolves against this base — set
  // once here rather than repeating an absolute origin on every page.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Affiliate Demo — Fashion Discovery & Deals",
    template: "%s",
  },
  description:
    "Affiliate Demo curates the best fashion deals across the web — trending pieces, price drops, and new arrivals, all in one place.",
  // Site-wide default: indexable. Individual private/utility routes
  // (admin, account, wishlist, auth pages, search) override this with
  // their own `robots: { index: false }` — see each page's `metadata`
  // export (§4).
  robots: { index: true, follow: true },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E0E10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        {/* PART 6 §13: site-wide Organization + WebSite structured data —
            present once, on every page, per schema.org convention (not
            per-product — product pages add their OWN Product schema on
            top of this, see app/product/[slug]/page.js). */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema()) }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded focus:bg-tag focus:px-4 focus:py-2 focus:text-ink focus:font-semibold w-0 h-0 focus:w-auto focus:h-auto"
        >
          Skip to content
        </a>
        <AuthProvider>
          <WishlistProvider>
            <NextTopLoader color="#ff3d57" showSpinner={false} height={3} />
            <Header />
            <main id="main-content">{children}</main>
            <Footer />
          </WishlistProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
