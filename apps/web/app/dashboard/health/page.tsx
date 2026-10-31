"use client";

import { useEffect, useState } from "react";

interface HealthData {
  status: string;
  database: string;
  counts: { claims: number; appeals: number; audit_entries: number };
  response_time_ms: number;
  version: string;
  environment: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetch("/api/v1/system/health")
      .then((r) => r.json())
      .then((d) => {
        setHealth(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  const ok = health?.status === "healthy";
  const dbOk = health?.database === "connected";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">System</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Health</h1>
        </div>
        <button
          onClick={refresh}
          className="rounded bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200"
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <p className="text-ink-400">Checking system health...</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">Connection Error</p>
          <p className="mt-1 text-xs text-red-500">{error}</p>
        </div>
      ) : health ? (
        <div className="grid gap-4">
          {/* Status banner */}
          <div
            className={`rounded-lg border p-6 text-center ${
              ok
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p className={`text-2xl font-bold ${ok ? "text-emerald-700" : "text-red-700"}`}>
              {ok ? "All Systems Operational" : "Degraded"}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              v{health.version} &middot; {health.environment}
            </p>
          </div>

          {/* Detail cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card
              label="Database"
              value={dbOk ? "Connected" : "Disconnected"}
              ok={dbOk}
            />
            <Card
              label="Response Time"
              value={`${health.response_time_ms?.toFixed(1) ?? "?"} ms`}
              ok={(health.response_time_ms ?? 999) < 500}
            />
            <Card label="Total Claims" value={String(health.counts?.claims ?? 0)} ok />
            <Card label="Total Appeals" value={String(health.counts?.appeals ?? 0)} ok />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-5 py-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink-900">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            ok ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
        {value}
      </p>
    </div>
  );
}
