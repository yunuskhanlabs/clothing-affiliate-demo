// PART 6 §4: account is a private, session-gated page and must not be
// indexed. The page itself is a Client Component ("use client"), and
// Next.js only allows `metadata` exports from Server Components — this
// thin server layout is the standard way to attach metadata to a client
// page without converting it (§3: minimum safe change, no rewrite).
export const metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }) {
  return children;
}
