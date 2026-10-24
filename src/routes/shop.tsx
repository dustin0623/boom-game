import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Chainframe" },
      { name: "description", content: "Open the Equipment Chest, buy Sabotage Devices and Help Kits." },
      { property: "og:title", content: "Shop — Chainframe" },
      { property: "og:description", content: "Open the Equipment Chest, buy Sabotage Devices and Help Kits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Shop" description="Open the Equipment Chest, buy Sabotage Devices and Help Kits." />
      <ComingSoon label="Shop" />
    </>
  );
}
