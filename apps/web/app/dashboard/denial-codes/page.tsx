"use client";

import { useState, useEffect } from "react";

interface DenialCode {
  code: string;
  group: string;
  reason: string;
  description: string;
  category: string;
  source: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Medical Necessity": "bg-red-100 text-red-700",
  "Authorization": "bg-purple-100 text-purple-700",
  "Coding": "bg-blue-100 text-blue-700",
  "Bundling": "bg-indigo-100 text-indigo-700",
  "Coverage": "bg-amber-100 text-amber-700",
  "Timely Filing": "bg-orange-100 text-orange-700",
  "Fee Schedule": "bg-teal-100 text-teal-700",
  "Patient Responsibility": "bg-green-100 text-green-700",
  "Information": "bg-cyan-100 text-cyan-700",
  "Duplicate": "bg-gray-200 text-gray-700",
  "Coordination of Benefits": "bg-pink-100 text-pink-700",
};

const GROUP_LABELS: Record<string, string> = {
  CO: "Contractual Obligation",
  PR: "Patient Responsibility",
  OA: "Other Adjustment",
  PI: "Payer Initiated",
};

export default function DenialCodesPage() {
  const [codes, setCodes] = useState<DenialCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/denial-codes?search=${encodeURIComponent(debouncedSearch)}`)
      .then((res) => res.json())
      .then(setCodes)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const grouped = codes.reduce<Record<string, DenialCode[]>>((acc, code) => {
    const cat = code.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(code);
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Reference &middot; CARC Codes
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Denial Code Reference
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Searchable reference of Claim Adjustment Reason Codes (CARC). Source: CMS CARC List.
        </p>
      </header>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, description, or category..."
          className="w-full max-w-md rounded border border-ink-300/50 px-4 py-2 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
        />
      </div>

      {/* Group legend */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(GROUP_LABELS).map(([key, label]) => (
          <span key={key} className="text-ink-500">
            <span className="font-mono font-semibold">{key}</span> = {label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-ink-400">Loading codes...</div>
      ) : codes.length === 0 ? (
        <div className="py-8 text-center text-ink-400">No codes match your search.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catCodes]) => (
            <div key={category}>
              <h2 className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    CATEGORY_COLORS[category] || "bg-gray-100 text-gray-700"
                  }`}
                >
                  {category}
                </span>
                <span className="text-xs text-ink-400">{catCodes.length} codes</span>
              </h2>
              <div className="space-y-1">
                {catCodes.map((code) => (
                  <div
                    key={code.code}
                    className="flex items-start gap-3 rounded border border-ink-300/20 bg-white px-4 py-3"
                  >
                    <span className="mt-0.5 rounded bg-ink-950 px-2 py-0.5 font-mono text-xs font-medium text-white">
                      {code.code}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-ink-700">{code.description}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        Group: {GROUP_LABELS[code.group] || code.group} &middot; Source: {code.source}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
