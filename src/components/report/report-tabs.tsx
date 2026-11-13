"use client";

import { useState, type ReactNode } from "react";

/** Accessible tabs; panels are server-rendered and passed in. */
export function ReportTabs({ tabs }: { tabs: { id: string; label: string; panel: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div role="tablist" className="no-print flex flex-col gap-2 border-b border-line pb-2 sm:flex-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`rounded-md px-4 py-3 text-left text-sm font-bold ${active === tab.id ? "bg-forest text-white" : "bg-cream text-ink hover:bg-mint"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <section key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id} className="pt-6">
          {tab.panel}
        </section>
      ))}
    </div>
  );
}
