"use client";

import { useEffect, useState } from "react";

interface TipGroup {
  denial_code: string;
  occurrence_count: number;
  tips: string[];
  source: string;
}

export default function PreventionPage() {
  const [groups, setGroups] = useState<TipGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/denial-prevention-tips")
      .then((r) => r.json())
      .then((d) => {
        setGroups(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Proactive</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Denial Prevention Tips
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Actionable recommendations based on your most common denial codes.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading prevention tips...</p>
      ) : groups.length === 0 ? (
        <p className="text-ink-400">No denial data to generate tips from.</p>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <div
              key={g.denial_code}
              className="rounded-lg border border-ink-200 bg-white px-5 py-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs font-semibold text-red-700">
                    {g.denial_code}
                  </span>
                  <span className="text-xs text-ink-500">
                    {g.occurrence_count} occurrence{g.occurrence_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="rounded bg-ink-100 px-2 py-0.5 text-[10px] text-ink-500">
                  {g.source}
                </span>
              </div>
              <ul className="space-y-2">
                {g.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
