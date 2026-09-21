"use client";

import { useRouter } from "next/navigation";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { EmptyState, LoadingState } from "@/components/ui/States";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOut } from "@/lib/auth/actions";

export default function AccountPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <Container className="pb-16 pt-24 sm:pt-28">
        <SectionHeading eyebrow="Account" title="Account" />
        <LoadingState label="Loading your account" />
      </Container>
    );
  }

  if (!user) {
    return (
      <Container className="pb-16 pt-24 sm:pt-28">
        <SectionHeading eyebrow="Account" title="Sign in" />
        <EmptyState
          title="You're not signed in"
          description="Sign in to manage your wishlist, saved searches, and price alerts."
          action={
            <div className="mt-2 flex gap-3">
              <Button as="link" href="/login">
                Sign in
              </Button>
              <Button as="link" href="/signup" variant="secondary">
                Create account
              </Button>
            </div>
          }
        />
      </Container>
    );
  }

  const displayName = user.user_metadata?.display_name || user.email?.split("@")[0];

  return (
    <Container className="max-w-lg pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Account" title={`Hi, ${displayName}`} description={user.email} />

      <div className="flex flex-col gap-3">
        <Button as="link" href="/wishlist" variant="secondary" className="w-full justify-start">
          Wishlist
        </Button>
        <Button as="link" href="/products" variant="secondary" className="w-full justify-start">
          Browse products
        </Button>
        <Button variant="ghost" onClick={handleSignOut} className="mt-4 w-full justify-start text-paper-dim">
          Sign out
        </Button>
      </div>
    </Container>
  );
}
