"use client";

import { useEffect } from "react";
import { logError } from "@/lib/observability/logger";

/**
 * PART 6 §51 — `global-error.js` is the ONLY boundary that can catch an
 * error thrown by the root layout itself (app/layout.js) — a normal
 * `error.js` can't, since it renders INSIDE the layout it's supposed to
 * be protecting against. Because the root layout (and its <html>/<body>)
 * may itself be the thing that failed, this file has to render its own
 * minimal <html>/<body> — it deliberately does NOT import Header/Footer/
 * globals.css or anything else that could itself be implicated in
 * whatever broke the root layout.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    logError("root layout error", { digest: error?.digest, message: error?.message });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#151513", color: "#f2f0ec", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
        <div>
          <p style={{ fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8b8983" }}>Affiliate Demo</p>
          <h1 style={{ fontSize: 20, margin: "12px 0" }}>Something went wrong</h1>
          <p style={{ color: "#8b8983", fontSize: 14, maxWidth: 360, margin: "0 auto 20px" }}>
            The page failed to load. It&apos;s been logged on our end — please try again.
          </p>
          <button
            onClick={reset}
            style={{ display: "inline-block", background: "#FF3D57", color: "#151513", padding: "10px 20px", border: "none", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
