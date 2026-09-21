"use client";

import { useState } from "react";
import Link from "next/link";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { AuthField, AuthFormError, AuthFormSuccess } from "@/components/auth/AuthForm";
import { signUpWithPassword } from "@/lib/auth/actions";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signUpError } = await signUpWithPassword({ email, password, displayName });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <Container className="max-w-md pb-24 pt-24 sm:pt-28">
        <SectionHeading eyebrow="Account" title="Check your email" />
        <AuthFormSuccess message={`We sent a confirmation link to ${email}. Follow it to finish creating your account.`} />
      </Container>
    );
  }

  return (
    <Container className="max-w-md pb-24 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Account" title="Create an account" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthFormError message={error} />
        <AuthField label="Name" type="text" name="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <AuthField label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <AuthField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={submitting} className="mt-2 w-full disabled:opacity-60">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-paper-dim">
        Already have an account?{" "}
        <Link href="/login" className="text-tag hover:text-tag-hover">
          Sign in
        </Link>
      </p>
    </Container>
  );
}
