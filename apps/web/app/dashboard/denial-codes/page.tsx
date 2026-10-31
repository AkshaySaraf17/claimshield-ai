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

interface PayerBreakdown { payer: string; count: number; }
interface AnalyticsRow {
  code: string;
  category: string;
  total_claims: number;
  total_denied_cents: number;
  won: number;
  lost: number;
  pending: number;
  payers: PayerBreakdown[];
  win_rate: number;
  avg_amount_cents: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
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
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState<"reference" | "analytics">("reference");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"amount" | "count" | "winrate">("amount");

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

  useEffect(() => {
    fetch("/api/v1/analytics/denial-codes")
      .then((r) => r.json())
      .then((d) => setAnalytics(d.codes || []));
  }, []);

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

      {/* Tab switcher */}
      <div className="mb-6 flex gap-2">
        {(["reference", "analytics"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === t ? "bg-ink-950 text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"
            }`}
          >
            {t === "reference" ? "Code Reference" : "Analytics"}
          </button>
        ))}
      </div>

      {tab === "analytics" ? (
        <AnalyticsView
          analytics={analytics}
          expanded={expanded}
          setExpanded={setExpanded}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      ) : (
      <>
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
      </>
      )}
    </main>
  );
}

function AnalyticsView({
  analytics,
  expanded,
  setExpanded,
  sortBy,
  setSortBy,
}: {
  analytics: AnalyticsRow[];
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  sortBy: "amount" | "count" | "winrate";
  setSortBy: (v: "amount" | "count" | "winrate") => void;
}) {
  const sorted = [...analytics].sort((a, b) => {
    if (sortBy === "amount") return b.total_denied_cents - a.total_denied_cents;
    if (sortBy === "count") return b.total_claims - a.total_claims;
    return b.win_rate - a.win_rate;
  });
  const totalDenied = analytics.reduce((s, c) => s + c.total_denied_cents, 0);
  const totalClaims = analytics.reduce((s, c) => s + c.total_claims, 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Unique Codes</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{analytics.length}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Total Claims</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{totalClaims}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Total Denied</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{dollars(totalDenied)}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <span className="text-xs text-ink-500 leading-6">Sort by:</span>
        {(["amount", "count", "winrate"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`rounded px-2 py-1 text-xs ${
              sortBy === s ? "bg-ink-900 text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"
            }`}
          >
            {s === "amount" ? "Amount" : s === "count" ? "Volume" : "Win Rate"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {sorted.map((c) => {
          const pct = totalDenied > 0 ? (c.total_denied_cents / totalDenied) * 100 : 0;
          const isExp = expanded === c.code;
          return (
            <div key={c.code} className="rounded-lg border border-ink-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpanded(isExp ? null : c.code)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-ink-50/50 transition"
              >
                <span className="w-20 font-mono text-sm font-semibold text-ink-900">{c.code}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[c.category] || "bg-ink-100 text-ink-600"}`}>
                  {c.category}
                </span>
                <div className="flex-1">
                  <div className="h-1.5 w-full rounded bg-ink-100">
                    <div className="h-1.5 rounded bg-ink-400" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-6 text-xs text-ink-600">
                  <span>{c.total_claims} claims</span>
                  <span className="font-mono">{dollars(c.total_denied_cents)}</span>
                  <span>Win <span className={c.win_rate >= 50 ? "text-emerald-600 font-semibold" : c.win_rate > 0 ? "text-amber-600" : "text-ink-400"}>{c.win_rate}%</span></span>
                  <span className="text-ink-300">{isExp ? "▲" : "▼"}</span>
                </div>
              </button>
              {isExp && (
                <div className="border-t border-ink-100 px-4 py-3 bg-ink-50/30">
                  <div className="grid grid-cols-4 gap-4 text-xs">
                    <div><p className="text-ink-400">Avg Amount</p><p className="font-mono font-semibold text-ink-700">{dollars(c.avg_amount_cents)}</p></div>
                    <div><p className="text-ink-400">Won</p><p className="font-semibold text-emerald-600">{c.won}</p></div>
                    <div><p className="text-ink-400">Lost</p><p className="font-semibold text-red-600">{c.lost}</p></div>
                    <div><p className="text-ink-400">Pending</p><p className="font-semibold text-amber-600">{c.pending}</p></div>
                  </div>
                  {c.payers.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase text-ink-400">Payer Distribution</p>
                      <div className="flex flex-wrap gap-2">
                        {c.payers.map((p) => (
                          <span key={p.payer} className="rounded bg-white border border-ink-200 px-2 py-0.5 text-[10px] text-ink-600">
                            {p.payer}: {p.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
