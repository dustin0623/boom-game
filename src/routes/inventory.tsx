import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Chainframe" },
      { name: "description", content: "All the gear you own." },
      { property: "og:title", content: "Inventory — Chainframe" },
      { property: "og:description", content: "All the gear you own." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Inventory" description="All the gear you own." />
      <ComingSoon label="Inventory" />
    </>
  );
}
