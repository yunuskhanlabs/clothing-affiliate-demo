"use client";

import { useRouter } from "next/navigation";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";

/**
 * PART 3: connected to the real per-user wishlist (§27) via
 * `WishlistProvider`, replacing Part 2's local-only `useState` preview.
 * Signed-out visitors are sent to `/login` instead of toggling — wishlist
 * rows are user-owned data (RLS-enforced, §25), so there's no anonymous
 * wishlist to fall back to.
 */
export default function WishlistButton({ productId, productName, className = "" }) {
  const router = useRouter();
  const { has, toggle } = useWishlist();
  const saved = productId ? has(productId) : false;

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!productId) return;

    const result = await toggle(productId);
    if (result?.requiresAuth) {
      router.push(`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`);
    }
  };

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`}
      onClick={handleClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/60 text-paper backdrop-blur-sm transition-colors duration-300 hover:text-tag focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 20 18" fill={saved ? "#FF3D57" : "none"} aria-hidden="true">
        <path
          d="M10 17S1.5 12.1 1.5 6.4C1.5 3.5 3.8 1.5 6.4 1.5c1.6 0 3 .8 3.6 2 .6-1.2 2-2 3.6-2 2.6 0 4.9 2 4.9 4.9C18.5 12.1 10 17 10 17Z"
          stroke={saved ? "#FF3D57" : "currentColor"}
          strokeWidth="1.4"
        />
      </svg>
    </button>
  );
}
