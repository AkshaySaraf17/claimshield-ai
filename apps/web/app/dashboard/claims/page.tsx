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

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending_review: ["in_progress", "cancelled"],
  in_progress: ["needs_review", "cancelled"],
  needs_review: ["approved", "in_progress", "cancelled"],
  approved: ["sent"],
  sent: ["won", "lost"],
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
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
      setSelected(new Set());
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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === claims.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(claims.map((c) => c.id)));
    }
  }

  const selectedClaims = claims.filter((c) => selected.has(c.id));
  const commonTransitions = selectedClaims.length > 0
    ? selectedClaims.reduce<string[]>((acc, c) => {
        const transitions = ALLOWED_TRANSITIONS[c.status] || [];
        if (acc.length === 0) return transitions;
        return acc.filter((t) => transitions.includes(t));
      }, [])
    : [];

  async function handleBatchTransition(newStatus: string) {
    setBatchLoading(true);
    try {
      const res = await fetch("/api/v1/claims/batch-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_ids: Array.from(selected), new_status: newStatus }),
      });
      if (!res.ok) throw new Error(`Batch transition failed: ${res.status}`);
      await fetchClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch transition failed");
    } finally {
      setBatchLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Casework &middot; All Claims
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
            Claims
          </h1>
        </div>
        <a
          href="/api/v1/claims/export"
          download
          className="rounded border border-ink-300/50 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
        >
          Export CSV
        </a>
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

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm">
          <span className="font-medium text-indigo-700">{selected.size} selected</span>
          {commonTransitions.length > 0 ? (
            <>
              <span className="text-ink-400">Move to:</span>
              {commonTransitions.map((status) => (
                <button
                  key={status}
                  onClick={() => handleBatchTransition(status)}
                  disabled={batchLoading}
                  className="rounded bg-ink-950 px-2 py-0.5 text-xs text-white hover:bg-ink-900 disabled:opacity-50"
                >
                  {status.replace(/_/g, " ")}
                </button>
              ))}
            </>
          ) : (
            <span className="text-ink-400">No common transitions available</span>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-ink-400 hover:text-ink-600"
          >
            Clear selection
          </button>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-ink-300/40">
        <table className="w-full text-sm">
          <thead className="bg-parchment/50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={claims.length > 0 && selected.size === claims.length}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
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
                <td colSpan={7} className="px-4 py-8 text-center text-ink-400">
                  Loading claims...
                </td>
              </tr>
            ) : claims.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-400">
                  No claims found.
                </td>
              </tr>
            ) : (
              claims.map((claim) => (
                <tr
                  key={claim.id}
                  className={`border-t border-ink-300/20 hover:bg-parchment/30 ${selected.has(claim.id) ? "bg-indigo-50/50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(claim.id)}
                      onChange={() => toggleSelect(claim.id)}
                      className="rounded"
                    />
                  </td>
                  <td
                    className="px-4 py-2 font-mono text-xs cursor-pointer"
                    onClick={() => router.push(`/dashboard/claims/${claim.id}`)}
                  >
                    {claim.claim_number || claim.id.slice(0, 8)}
                  </td>
                  <td
                    className="px-4 py-2 cursor-pointer"
                    onClick={() => router.push(`/dashboard/claims/${claim.id}`)}
                  >
                    {claim.payer_name || "—"}
                  </td>
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
