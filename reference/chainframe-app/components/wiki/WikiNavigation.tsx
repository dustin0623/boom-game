"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function WikiNavigation({
  sections,
}: {
  sections: readonly { id: string; label: string }[];
}) {
  const [selected, setSelected] = useState(sections[0]?.id ?? "");
  return (
    <>
      <div className="mb-6 lg:hidden">
        <label
          htmlFor="wiki-section"
          className="mb-2 block text-xs font-medium text-muted-foreground"
        >
          Jump to a section
        </label>
        <select
          id="wiki-section"
          value={selected}
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => {
            const id = event.currentTarget.value;
            setSelected(id);
            window.location.hash = id;
            document.getElementById(id)?.focus({ preventScroll: true });
          }}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </div>
      <nav
        aria-label="Game guide sections"
        className="sticky top-6 hidden max-h-[calc(100dvh-5rem)] self-start overflow-y-auto rounded-xl border border-border bg-card/70 p-3 lg:block"
      >
        <p className="px-3 pb-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          In this guide
        </p>
        <ul className="space-y-1">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={() => setSelected(section.id)}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === section.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
