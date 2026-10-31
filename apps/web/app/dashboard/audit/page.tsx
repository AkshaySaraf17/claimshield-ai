"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../components/AuthProvider";
import { authFetch } from "../../lib/auth";

interface AuditEntry {
  id: number;
  tenant_id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  detail: Record<string, unknown>;
  prev_hash: string;
  entry_hash: string;
  created_at: string;
}

interface VerifyResult {
  valid: boolean;
  entries_checked: number;
  first_broken_id: number | null;
}

export default function AuditViewerPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/v1/audit/entries?limit=100`
        : `/api/v1/audit/entries?limit=100`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Failed to load audit log: ${res.status}`);
      setEntries(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/v1/audit/verify`
        : `/api/v1/audit/verify`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Verify failed: ${res.status}`);
      setVerifyResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Compliance &middot; Audit Trail
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Append-only, hash-chained entries. Tamper detection built in.
          </p>
        </div>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="rounded bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-900 disabled:opacity-60"
        >
          {verifying ? "Verifying..." : "Verify chain integrity"}
        </button>
      </header>

      {/* Chain verification result */}
      {verifyResult && (
        <div className={`mb-6 rounded border px-4 py-3 text-sm ${
          verifyResult.valid
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-red-300 bg-red-50 text-red-700"
        }`}>
          {verifyResult.valid ? (
            <>Chain integrity verified. {verifyResult.entries_checked} entries checked.</>
          ) : (
            <>
              Chain broken at entry #{verifyResult.first_broken_id}.{" "}
              {verifyResult.entries_checked} entries checked before failure.
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Audit entries */}
      <div className="space-y-2">
        {loading ? (
          <div className="py-8 text-center text-ink-400">Loading audit log...</div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-ink-400">No audit entries found.</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded border border-ink-300/30 bg-white"
            >
              <button
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-parchment/30"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-400">#{entry.id}</span>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                    {entry.action}
                  </span>
                  <span className="text-ink-600">
                    {entry.resource_type}/{entry.resource_id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-ink-400">
                    by {entry.actor_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-300" title={entry.entry_hash}>
                    {entry.entry_hash.slice(0, 12)}...
                  </span>
                  <span className="text-xs text-ink-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                  <span className="text-ink-400">{expandedId === entry.id ? "−" : "+"}</span>
                </div>
              </button>

              {expandedId === entry.id && (
                <div className="border-t border-ink-300/20 bg-parchment/20 px-4 py-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-ink-500">Actor:</span>{" "}
                      <span className="font-mono">{entry.actor_id}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-ink-500">Resource:</span>{" "}
                      <span className="font-mono">{entry.resource_type}/{entry.resource_id}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold text-ink-500">Entry hash:</span>{" "}
                      <span className="break-all font-mono text-ink-600">{entry.entry_hash}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold text-ink-500">Previous hash:</span>{" "}
                      <span className="break-all font-mono text-ink-600">{entry.prev_hash}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold text-ink-500">Detail:</span>
                      <pre className="mt-1 overflow-x-auto rounded bg-white p-2 font-mono text-ink-700">
                        {JSON.stringify(entry.detail, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
