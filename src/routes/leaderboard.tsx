import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Chainframe" },
      { name: "description", content: "Combined Notoriety, mining and XP score." },
      { property: "og:title", content: "Leaderboard — Chainframe" },
      { property: "og:description", content: "Combined Notoriety, mining and XP score." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Leaderboard" description="Combined Notoriety, mining and XP score." />
      <ComingSoon label="Leaderboard" />
    </>
  );
}
