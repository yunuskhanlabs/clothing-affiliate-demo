"use client";

import { useState, useEffect } from "react";
import { getImageProps } from "next/image";

/**
 * Slide data — three separate image sources per slide:
 *   desktop  → ≥ 1024 px (lg breakpoint)
 *   tablet   → 768 px – 1023 px (md breakpoint)
 *   mobile   → < 768 px (sm and below)
 *
 * Files live in /public/hero.image/ and are served as static assets.
 */
const slides = [
  {
    id: 1,
    desktop: "/hero.image/desktop.01.png",
    tablet: "/hero.image/tablet.01.png",
    mobile: "/hero.image/mobile.01.png",
    alt: "Hero Banner 1",
  },
  {
    id: 2,
    desktop: "/hero.image/desktop.02.png",
    tablet: "/hero.image/tablet.02.png",
    mobile: "/hero.image/mobile.02.png",
    alt: "Hero Banner 2",
  },
];

/**
 * ArtDirectedSlide renders a single banner slide using a <picture> element
 * with three <source> breakpoints so the browser always selects the correct
 * device-specific artwork without any cropping or resizing.
 *
 * - Desktop  : min-width 1024 px → desktop.0N.png
 * - Tablet   : min-width 768 px  → tablet.0N.png
 * - Mobile   : (default fallback) → mobile.0N.png
 *
 * The img uses width:100% / height:auto so the image fills the container
 * width while preserving its original aspect ratio exactly.
 */
function ArtDirectedSlide({ slide, isActive, priority }) {
  const common = {
    alt: slide.alt,
    fill: true,
    priority,
    sizes: "100vw",
    className: "object-contain block"
  };
  const { props: desktop } = getImageProps({ ...common, src: slide.desktop });
  const { props: tablet } = getImageProps({ ...common, src: slide.tablet });
  const { props: mobile } = getImageProps({ ...common, src: slide.mobile });

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
        isActive ? "opacity-100 z-10" : "opacity-0 z-0"
      }`}
    >
      <picture className="w-full h-full block">
        {/* Desktop: >= 1025 px */}
        <source media="(min-width: 1025px)" srcSet={desktop.srcSet} />
        {/* Tablet: 768 px - 1024 px */}
        <source media="(min-width: 768px)" srcSet={tablet.srcSet} />
        {/* Mobile: < 768 px - also the img fallback src */}
        <img {...mobile} />
      </picture>
    </div>
  );
}

export default function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000); // 5 seconds per slide
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-full aspect-[4/3] sm:aspect-[4/3] md:aspect-[16/9] lg:aspect-[1966/800] overflow-hidden bg-gray-50 mt-16 sm:mt-20">
      {slides.map((slide, index) => (
        <ArtDirectedSlide
          key={slide.id}
          slide={slide}
          isActive={currentSlide === index}
          priority={index === 0} // Only prioritize the first slide
        />
      ))}

      {/* CTA Buttons */}
      <div className="absolute bottom-[12%] sm:bottom-10 left-1/2 -translate-x-1/2 md:left-[8%] md:translate-x-0 z-30 flex flex-row items-center justify-center gap-2 sm:gap-4 w-[70%] sm:w-auto max-w-xs sm:max-w-none">
        <a
          href="/products"
          className="flex-1 sm:flex-none flex items-center justify-center px-3 py-2 sm:px-10 sm:py-3.5 bg-[#FF0054] text-black font-bold uppercase tracking-wide text-[10px] sm:text-sm rounded transition-all duration-300 hover:bg-[#ff1a66] hover:scale-[1.02]"
        >
          Shop Now
        </a>
        <a
          href="/deals"
          className="flex-1 sm:flex-none flex items-center justify-center px-3 py-2 sm:px-10 sm:py-3.5 bg-black/20 backdrop-blur-sm border border-white/50 text-white font-medium uppercase tracking-wide text-[10px] sm:text-sm rounded transition-all duration-300 hover:bg-white/10 hover:border-white hover:scale-[1.02]"
        >
          Today's Deals
        </a>
      </div>

      {/* Slider Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2 z-30">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              currentSlide === index
                ? "bg-black scale-110"
                : "bg-black/40 hover:bg-black/60"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
