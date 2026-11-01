"use client";

import { useEffect, useState } from "react";

interface RouteResult {
  claim_id: string;
  assigned_to: string;
  assigned_to_name: string;
  rule_name: string;
  reason: string;
}

const TEAM: Record<string, string> = {
  "dev-user-001": "Alice Chen",
  "dev-user-002": "Bob Martinez",
  "dev-user-003": "Carol Williams",
  "dev-user-004": "David Kim",
};

export default function AutoRouterPage() {
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null; status: string }[]>([]);
  const [results, setResults] = useState<Record<string, RouteResult | { error: string }>>({});
  const [routing, setRouting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null; status: string }) => ({
          id: c.id, claim_number: c.claim_number, status: c.status,
        })));
      });
  }, []);

  async function routeClaim(claimId: string) {
    setRouting(claimId);
    try {
      const res = await fetch(`/api/v1/claims/${claimId}/auto-route`, { method: "POST" });
      const data = await res.json();
      setResults((r) => ({ ...r, [claimId]: data }));
    } catch {
      setResults((r) => ({ ...r, [claimId]: { error: "Routing failed" } }));
    }
    setRouting(null);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Automation</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Auto-Router</h1>
        <p className="mt-1 text-sm text-ink-500">Automatically assign claims to team members based on routing rules.</p>
      </header>

      <div className="space-y-2">
        {claims.map((c) => {
          const result = results[c.id];
          const routed = result && !("error" in result);
          return (
            <div key={c.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-ink-800">{c.claim_number || c.id.slice(0, 8)}</span>
                  <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{c.status.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center gap-3">
                  {routed && (
                    <div className="text-right text-xs">
                      <span className="text-green-600 font-medium">{(result as RouteResult).assigned_to_name || TEAM[(result as RouteResult).assigned_to]}</span>
                      <span className="text-ink-400 ml-1">({(result as RouteResult).rule_name})</span>
                    </div>
                  )}
                  {result && "error" in result && (
                    <span className="text-xs text-amber-600">{result.error}</span>
                  )}
                  <button
                    onClick={() => routeClaim(c.id)}
                    disabled={routing === c.id}
                    className="rounded border border-ink-200 px-3 py-1 text-xs hover:bg-ink-50 disabled:opacity-50"
                  >
                    {routing === c.id ? "Routing..." : routed ? "Re-route" : "Route"}
                  </button>
                </div>
              </div>
              {routed && (result as RouteResult).reason && (
                <p className="mt-1 text-xs text-ink-500">{(result as RouteResult).reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
