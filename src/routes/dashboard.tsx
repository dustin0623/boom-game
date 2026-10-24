import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Chainframe" },
      { name: "description", content: "Vault, mining, stats and activity." },
      { property: "og:title", content: "Dashboard — Chainframe" },
      { property: "og:description", content: "Vault, mining, stats and activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="Vault, mining, stats and activity." />
      <ComingSoon label="Dashboard" />
    </>
  );
}
