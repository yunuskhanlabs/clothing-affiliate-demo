"use client";

import { useState } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { AuthField, AuthFormError, AuthFormSuccess } from "@/components/auth/AuthForm";
import { requestPasswordReset } from "@/lib/auth/actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await requestPasswordReset(email);
    setSubmitting(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    setSent(true);
  };

  return (
    <Container className="max-w-md pb-24 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Account" title="Reset your password" />
      {sent ? (
        <AuthFormSuccess message={`If an account exists for ${email}, we've sent a password reset link.`} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthFormError message={error} />
          <AuthField label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={submitting} className="mt-2 w-full disabled:opacity-60">
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </Container>
  );
}
