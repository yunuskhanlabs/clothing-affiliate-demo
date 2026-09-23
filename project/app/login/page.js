"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { AuthField, AuthFormError } from "@/components/auth/AuthForm";
import { signInWithPassword } from "@/lib/auth/actions";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    let nextUrl = urlParams.get("next") || "/admin";
    if (!nextUrl.startsWith("/") || nextUrl.startsWith("//")) {
      nextUrl = "/admin"; // Prevent open redirects
    }
    
    router.push(nextUrl);
    router.refresh();
  };

  const handleQuickAdminLogin = () => {
    setEmail("admin@demo.com");
    setPassword("demo123");
    handleSubmit();
  };

  return (
    <Container className="max-w-md pb-24 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Demo Access" title="Sign in to Affiliate Demo" />

      {/* Demo Credentials Box */}
      <div className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-paper">
        <div className="flex items-center justify-between pb-2">
          <span className="font-semibold text-amber-400">⚡ Demo Admin Credentials</span>
          <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs font-mono text-amber-300">Auto-filled</span>
        </div>
        <p className="text-xs text-paper-muted">You can test the entire admin panel using these pre-filled credentials:</p>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded bg-black/40 p-2 font-mono text-xs">
          <div>
            <span className="text-paper-dim">User:</span> <strong className="text-paper">admin@demo.com</strong>
          </div>
          <div>
            <span className="text-paper-dim">Pass:</span> <strong className="text-paper">demo123</strong>
          </div>
        </div>
        <button
          type="button"
          onClick={handleQuickAdminLogin}
          className="mt-3 w-full rounded bg-amber-500 px-3 py-2 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-amber-400"
        >
          🚀 1-Click Login to Admin Panel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthFormError message={error} />
        <AuthField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={submitting} className="mt-2 w-full disabled:opacity-60">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm text-paper-dim">
        <Link href="/admin" className="text-tag font-semibold hover:text-tag-hover">
          → Direct link to Admin Panel
        </Link>
        <p>
          Need support?{" "}
          <Link href="/" className="text-paper hover:underline">
            Return to Store
          </Link>
        </p>
      </div>
    </Container>
  );
}
