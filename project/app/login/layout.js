// PART 6 §4: auth-flow pages carry their own noindex (see app/robots.js
// for why robots.txt itself does NOT block this route). Client Component
// pages can't export `metadata` directly in the App Router, so this
// thin server layout carries it instead (§3: minimum safe change).
export const metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }) {
  return children;
}
