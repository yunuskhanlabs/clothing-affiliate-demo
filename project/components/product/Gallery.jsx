"use client";

import { useState } from "react";
import Image from "next/image";

export default function Gallery({ images, productName }) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const list = Array.isArray(images) ? images : [];
  const current = list[active] || list[0];

  return (
    <div className="w-full">
      {/* Main product display card - constrained to elegant balanced dimensions */}
      <div className="relative aspect-[3/4] max-h-[480px] w-full max-w-[440px] mx-auto overflow-hidden rounded-md border border-border bg-surface flex items-center justify-center shadow-sm">
        {!loaded && !errored && <div className="absolute inset-0 animate-pulse bg-surface-raised" aria-hidden="true" />}
        {!errored && current ? (
          <Image
            key={current}
            src={current}
            alt={productName}
            fill
            priority={active === 0}
            sizes="(max-width: 640px) 100vw, 440px"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={`object-contain p-3 sm:p-4 transition-opacity duration-300 ease-premium ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-raised to-surface p-4 text-center text-sm text-paper-dim">
            {productName}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {list.length > 1 && (
        <div className="mt-3 flex justify-center gap-3" role="tablist" aria-label="Product images">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Image ${i + 1} of ${list.length}`}
              onClick={() => {
                setActive(i);
                setLoaded(false);
                setErrored(false);
              }}
              className={`relative aspect-[3/4] h-16 w-14 shrink-0 overflow-hidden rounded-md border bg-surface transition-all duration-200 sm:h-20 sm:w-16 ${
                active === i ? "border-tag ring-1 ring-tag" : "border-border hover:border-border-strong"
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
