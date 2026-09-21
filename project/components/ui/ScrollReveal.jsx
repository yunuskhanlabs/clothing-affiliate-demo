"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fades + slides an element up when it enters the viewport. This is a
 * Part 2 primitive, intentionally separate from `animate-fade-up`
 * (Part 1, load-time only — see MASTER-ARCHITECTURE.md §5) because the
 * two need different trigger mechanisms: load vs. IntersectionObserver.
 *
 * Cheap by design: one observer per mounted element, unobserved after the
 * first reveal (no repeated work on scroll up/down), and a no-op path for
 * `prefers-reduced-motion` (content just renders visible immediately).
 */
export default function ScrollReveal({ as: Tag = "div", delay = 0, className = "", children }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(node);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`transition-all duration-500 ease-premium ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </Tag>
  );
}
