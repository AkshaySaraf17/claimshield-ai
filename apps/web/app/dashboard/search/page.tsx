"use client";

import { useState } from "react";
import Link from "next/link";

interface ClaimResult {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  amount_denied_cents: number | null;
  status: string;
  created_at: string;
}

const STATUSES = [
  "pending_review",
  "in_progress",
  "needs_review",
  "approved",
  "sent",
  "won",
  "lost",
  "cancelled",
];

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [payer, setPayer] = useState("");
  const [denialCode, setDenialCode] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const [results, setResults] = useState<ClaimResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (payer) params.set("payer", payer);
    if (denialCode) params.set("denial_code", denialCode);
    if (minAmount) params.set("min_amount_cents", String(Math.round(parseFloat(minAmount) * 100)));
    if (maxAmount) params.set("max_amount_cents", String(Math.round(parseFloat(maxAmount) * 100)));
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
    params.set("limit", "100");

    const resp = await fetch(`/api/v1/claims/search?${params.toString()}`);
    const data = await resp.json();
    setResults(data.claims || []);
    setTotal(data.total || 0);
    setSearched(true);
    setLoading(false);
  }

  function clearFilters() {
    setQuery("");
    setStatus("");
    setPayer("");
    setDenialCode("");
    setMinAmount("");
    setMaxAmount("");
    setDateFrom("");
    setDateTo("");
    setResults([]);
    setTotal(0);
    setSearched(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Find Claims
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Advanced Search
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Filter claims by multiple criteria. All filters are combined with AND.
        </p>
      </header>

      {/* Filter form */}
      <div className="rounded-lg border border-ink-200 bg-white p-4 mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Text search
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Payer, code, claim #..."
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Payer
            </label>
            <input
              type="text"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              placeholder="e.g. Aetna"
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Denial Code
            </label>
            <input
              type="text"
              value={denialCode}
              onChange={(e) => setDenialCode(e.target.value)}
              placeholder="e.g. CO-50"
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Min Amount ($)
            </label>
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Max Amount ($)
            </label>
            <input
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="999999.99"
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Created after
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Created before
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-500">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded border border-ink-300 px-2 py-1 text-xs"
            >
              <option value="created_at">Created</option>
              <option value="amount_denied_cents">Amount</option>
              <option value="payer_name">Payer</option>
              <option value="status">Status</option>
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              className="rounded border border-ink-300 px-2 py-1 text-xs"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <div className="flex-1" />
          <button
            onClick={clearFilters}
            className="rounded border border-ink-300 px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-50"
          >
            Clear
          </button>
          <button
            onClick={runSearch}
            disabled={loading}
            className="rounded bg-ink-950 px-4 py-1.5 text-xs font-medium text-white hover:bg-ink-900 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div>
          <p className="mb-3 text-sm text-ink-500">
            {total} result{total !== 1 ? "s" : ""} found
          </p>

          {results.length === 0 ? (
            <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
              <p className="text-sm text-ink-400">
                No claims match your filters.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                      Claim #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                      Payer
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                      Code
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-ink-600">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-ink-100 last:border-0 hover:bg-ink-50"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/dashboard/claims/${c.id}`}
                          className="font-mono text-xs text-indigo-600 hover:underline"
                        >
                          {c.claim_number || c.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-ink-700">
                        {c.payer_name || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-600">
                        {c.denial_code || "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {dollars(c.amount_denied_cents)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            STATUS_COLORS[c.status] || "bg-ink-100 text-ink-600"
                          }`}
                        >
                          {c.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-500">
                        {c.created_at
                          ? new Date(c.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
