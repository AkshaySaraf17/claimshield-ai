"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { authFetch } from "../../lib/auth";

interface Claim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  amount_denied_cents: number | null;
  status: string;
  reviewed_by: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function ClaimsListPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);

      const url = apiBase
        ? `${apiBase}/api/v1/claims?${params}`
        : `/api/v1/claims?${params}`;

      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Failed to load claims: ${res.status}`);
      setClaims(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }, [apiBase, statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const centsToDisplay = (cents: number | null) =>
    cents !== null ? `$${(cents / 100).toFixed(2)}` : "—";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Casework &middot; All Claims
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Claims
        </h1>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearchQuery(searchInput); setPage(0); }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search payer, code, reason..."
            className="w-56 rounded border border-ink-300/50 px-3 py-1 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
          />
          <button
            type="submit"
            className="rounded bg-ink-950 px-3 py-1 text-sm text-white hover:bg-ink-900"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(0); }}
              className="rounded border border-ink-300/50 px-2 py-1 text-sm text-ink-500 hover:bg-ink-100"
            >
              Clear
            </button>
          )}
        </form>
        <label className="text-sm text-ink-600">
          Status:
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="ml-2 rounded border border-ink-300/50 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {Object.keys(STATUS_COLORS).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
        <button
          onClick={fetchClaims}
          className="rounded border border-ink-300/50 px-3 py-1 text-sm text-ink-600 hover:bg-ink-100"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-ink-300/40">
        <table className="w-full text-sm">
          <thead className="bg-parchment/50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Claim #</th>
              <th className="px-4 py-2">Payer</th>
              <th className="px-4 py-2">Denial Code</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  Loading claims...
                </td>
              </tr>
            ) : claims.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  No claims found.
                </td>
              </tr>
            ) : (
              claims.map((claim) => (
                <tr key={claim.id} onClick={() => router.push(`/dashboard/claims/${claim.id}`)} className="cursor-pointer border-t border-ink-300/20 hover:bg-parchment/30">
                  <td className="px-4 py-2 font-mono text-xs">
                    {claim.claim_number || claim.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2">{claim.payer_name || "—"}</td>
                  <td className="px-4 py-2">
                    <span className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs">
                      {claim.denial_code || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono">{centsToDisplay(claim.amount_denied_cents)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[claim.status] || "bg-gray-100 text-gray-800"}`}>
                      {claim.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-400">
                    {new Date(claim.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
        <button
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          className="rounded border border-ink-300/50 px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={claims.length < PAGE_SIZE}
          onClick={() => setPage(page + 1)}
          className="rounded border border-ink-300/50 px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </main>
  );
}
