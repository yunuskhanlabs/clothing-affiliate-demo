"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const WishlistContext = createContext({
  ids: new Set(),
  ready: false,
  has: () => false,
  toggle: async () => {},
});

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("demo_wishlist");
      if (stored) {
        setIds(new Set(JSON.parse(stored)));
      } else {
        // Default 2 demo items in wishlist
        setIds(new Set(["p-0001", "p-0002"]));
      }
    } catch {
      setIds(new Set(["p-0001"]));
    }
    setReady(true);
  }, []);

  const has = useCallback((productId) => ids.has(productId), [ids]);

  const toggle = useCallback(
    async (productId) => {
      setIds((prev) => {
        const next = new Set(prev);
        if (next.has(productId)) {
          next.delete(productId);
        } else {
          next.add(productId);
        }
        try {
          localStorage.setItem("demo_wishlist", JSON.stringify([...next]));
        } catch {}
        return next;
      });
      return { success: true };
    },
    []
  );

  return (
    <WishlistContext.Provider value={{ ids, ready, has, toggle }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
