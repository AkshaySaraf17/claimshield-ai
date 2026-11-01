"use client";

import { useEffect, useState } from "react";

interface TipGroup {
  denial_code: string;
  occurrence_count: number;
  tips: string[];
  source: string;
}

export default function PreventionTipsPage() {
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
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Intelligence</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Denial Prevention Tips</h1>
        <p className="mt-1 text-sm text-ink-500">Actionable prevention strategies based on your denial patterns.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading tips...</p>
      ) : groups.length === 0 ? (
        <p className="text-ink-400">No denial patterns found yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.sort((a, b) => b.occurrence_count - a.occurrence_count).map((g) => (
            <div key={g.denial_code} className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-red-100 px-2 py-0.5 text-sm font-bold text-red-700">{g.denial_code}</span>
                  <span className="text-sm text-ink-500">{g.occurrence_count} occurrence{g.occurrence_count !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-xs text-ink-400 italic">{g.source}</span>
              </div>
              <ul className="space-y-1.5">
                {g.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
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
