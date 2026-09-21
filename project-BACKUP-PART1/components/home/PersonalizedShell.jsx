import Section, { SectionHeading } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/States";
import Button from "@/components/ui/Button";

/**
 * Recommendations depend on account/auth + AI recommendation data that
 * ship in later phases — this establishes the section chrome and a
 * signed-out empty state so Part 2/3 can drop real cards in directly.
 */
export default function PersonalizedShell() {
  return (
    <Section id="for-you">
      <SectionHeading
        eyebrow="For you"
        title="Personalized picks"
        description="Sign in and Rove will start learning your style."
      />
      <EmptyState
        title="No picks yet"
        description="Create an account to get recommendations tailored to what you browse and save."
        action={
          <Button as="link" href="/account" variant="secondary" className="mt-2">
            Create account
          </Button>
        }
      />
    </Section>
  );
}
