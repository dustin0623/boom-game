import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — Chainframe" },
      { name: "description", content: "Buy and sell rig parts." },
      { property: "og:title", content: "Marketplace — Chainframe" },
      { property: "og:description", content: "Buy and sell rig parts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Marketplace" description="Buy and sell rig parts." />
      <ComingSoon label="Marketplace" />
    </>
  );
}
