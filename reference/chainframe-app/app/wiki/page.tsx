import type { Metadata } from "next";

import { WikiPage } from "@/components/pages/WikiPage";

export const metadata: Metadata = {
  title: "Wiki — Chainframe Player Guide",
  description:
    "Start playing Chainframe: Hive registration, HASH and SPARKS, mining, upgrades, equipment, HIVE trading, history and rankings.",
  openGraph: {
    title: "Wiki — Chainframe Player Guide",
    description:
      "A practical player guide to mining, equipment, raids, payments and progress, with current rules and worked examples.",
    type: "article",
  },
  twitter: { card: "summary_large_image" },
};

export default function WikiRoutePage() {
  return <WikiPage />;
}
