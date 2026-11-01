"use client";

import { useEffect, useState } from "react";

interface StatusEvent {
  timestamp: string;
  action: string;
  actor_id: string;
  from_status: string | null;
  to_status: string | null;
}

const TEAM: Record<string, string> = {
  "dev-user-001": "Alice Chen",
  "dev-user-002": "Bob Martinez",
  "dev-user-003": "Carol Williams",
  "dev-user-004": "David Kim",
};

export default function StatusHistoryPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/status-history`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">History</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Status History</h1>
        <p className="mt-1 text-sm text-ink-500">Complete status transition log per claim.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading history...</p>
      ) : events.length === 0 ? (
        <p className="text-ink-400">No status events for this claim.</p>
      ) : (
        <div className="relative ml-4 border-l-2 border-ink-200 pl-6 space-y-4">
          {events.map((ev, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
              <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-ink-800">{ev.action.replace(/\./g, " ").replace(/_/g, " ")}</span>
                  <span className="text-xs text-ink-400">{new Date(ev.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <span>By {TEAM[ev.actor_id] || ev.actor_id}</span>
                  {ev.from_status && ev.to_status && (
                    <span className="flex items-center gap-1">
                      <span className="rounded bg-ink-100 px-1.5 py-0.5">{ev.from_status}</span>
                      <span>→</span>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700">{ev.to_status}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
