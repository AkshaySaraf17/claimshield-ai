"use client";

import { useEffect, useState } from "react";

interface AuditEntry {
  id: number;
  action: string;
  actor: string;
  actor_id: string;
  detail: string | null;
  hash: string;
  created_at: string;
}

export default function ClaimAuditPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({
          id: c.id,
          claim_number: c.claim_number,
        })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/audit-trail`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Compliance</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Audit Trail</h1>
        <p className="mt-1 text-sm text-ink-500">
          Hash-chained audit log for a single claim — every action is tamper-evident.
        </p>
      </header>

      <div className="mb-6">
        <select
          value={claimId}
          onChange={(e) => setClaimId(e.target.value)}
          className="rounded border border-ink-200 px-3 py-2 text-sm"
        >
          {claims.map((c) => (
            <option key={c.id} value={c.id}>
              {c.claim_number || c.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading audit trail...</p>
      ) : entries.length === 0 ? (
        <p className="text-ink-400">No audit entries for this claim.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Detail</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Hash</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-ink-50">
                  <td className="px-4 py-3">
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-700">{e.actor}</td>
                  <td className="px-4 py-3 text-xs text-ink-500 max-w-xs truncate">
                    {e.detail || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-400">{e.hash}</td>
                  <td className="px-4 py-3 text-right text-xs text-ink-500">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
