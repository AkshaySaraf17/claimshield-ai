"use client";

import { useEffect, useState } from "react";

interface DenialCodeRef {
  code: string;
  name: string;
  category: string;
  description: string;
  common_causes: string[];
  resolution_steps: string[];
  source: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  coding: "bg-purple-100 text-purple-700",
  documentation: "bg-blue-100 text-blue-700",
  timely_filing: "bg-red-100 text-red-700",
  coverage: "bg-amber-100 text-amber-700",
  bundling: "bg-teal-100 text-teal-700",
  authorization: "bg-orange-100 text-orange-700",
  patient_responsibility: "bg-green-100 text-green-700",
};

export default function CodeLookupPage() {
  const [codes, setCodes] = useState<DenialCodeRef[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/v1/denial-code-reference?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => {
          setCodes(Array.isArray(d) ? d : []);
          setLoading(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Reference</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Denial Code Lookup</h1>
        <p className="mt-1 text-sm text-ink-500">
          Searchable reference for CARC/RARC denial codes with causes and resolution steps.
        </p>
      </header>

      <div className="mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, name, or category..."
          className="w-full rounded border border-ink-200 px-4 py-2.5 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-ink-400">Loading codes...</p>
      ) : codes.length === 0 ? (
        <p className="text-ink-400">No matching denial codes.</p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.code} className="rounded-lg border border-ink-200 bg-white">
              <button
                onClick={() => setExpanded(expanded === c.code ? null : c.code)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-ink-800">{c.code}</span>
                  <span className="text-sm text-ink-600">{c.name}</span>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs ${CATEGORY_COLORS[c.category] || "bg-ink-100 text-ink-600"}`}>
                  {c.category.replace(/_/g, " ")}
                </span>
              </button>
              {expanded === c.code && (
                <div className="border-t border-ink-100 px-4 py-3 space-y-3">
                  <p className="text-sm text-ink-700">{c.description}</p>
                  <div>
                    <p className="text-xs font-semibold text-ink-500 mb-1">Common Causes</p>
                    <ul className="list-disc list-inside text-sm text-ink-600 space-y-0.5">
                      {c.common_causes.map((cause) => (
                        <li key={cause}>{cause}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-500 mb-1">Resolution Steps</p>
                    <ol className="list-decimal list-inside text-sm text-ink-600 space-y-0.5">
                      {c.resolution_steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <p className="text-xs text-ink-400">Source: {c.source}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
