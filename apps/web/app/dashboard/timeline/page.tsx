"use client";

import { useEffect, useState } from "react";

interface TimelineEvent {
  type: string;
  timestamp: string;
  title?: string;
  detail: string;
  actor?: string;
  action?: string;
}

const TYPE_COLORS: Record<string, string> = {
  claim_created: "bg-blue-500",
  note: "bg-yellow-500",
  comment: "bg-indigo-500",
  appeal_created: "bg-purple-500",
  appeal_approved: "bg-green-500",
  cost: "bg-orange-500",
  payer_response: "bg-teal-500",
  assignment: "bg-pink-500",
  audit: "bg-ink-400",
  deadline: "bg-red-500",
  status_change: "bg-amber-500",
};

export default function TimelinePage() {
  const [claimId, setClaimId] = useState("");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({
          id: c.id,
          claim_number: c.claim_number,
        })));
        if (list.length > 0) {
          setClaimId(list[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/timeline`)
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
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Timeline</h1>
        <p className="mt-1 text-sm text-ink-500">
          Chronological event history for a single claim.
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
        <p className="text-ink-400">Loading timeline...</p>
      ) : events.length === 0 ? (
        <p className="text-ink-400">No events for this claim.</p>
      ) : (
        <div className="relative ml-4 border-l-2 border-ink-200 pl-6 space-y-4">
          {events.map((ev, i) => (
            <div key={i} className="relative">
              <div
                className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ${
                  TYPE_COLORS[ev.type] || "bg-ink-300"
                }`}
              />
              <div className="rounded-lg border border-ink-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-800">
                    {ev.title || ev.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-ink-400">
                    {new Date(ev.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-600">{ev.detail}</p>
                {ev.actor && (
                  <p className="mt-1 text-xs text-ink-400">by {ev.actor}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
