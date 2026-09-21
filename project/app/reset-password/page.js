"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { AuthField, AuthFormError } from "@/components/auth/AuthForm";
import { updatePassword } from "@/lib/auth/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    router.push("/account");
    router.refresh();
  };

  return (
    <Container className="max-w-md pb-24 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Account" title="Set a new password" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthFormError message={error} />
        <AuthField
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={submitting} className="mt-2 w-full disabled:opacity-60">
          {submitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </Container>
  );
}
