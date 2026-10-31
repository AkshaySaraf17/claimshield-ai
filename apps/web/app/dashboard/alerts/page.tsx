"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Alert {
  type: string;
  severity: string;
  title: string;
  detail: string;
  claim_id?: string;
  appeal_id?: string;
  timestamp: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-300 bg-red-50",
  warning: "border-amber-300 bg-amber-50",
  info: "border-blue-200 bg-blue-50",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

const TYPE_LABELS: Record<string, string> = {
  deadline_approaching: "Deadline",
  stale_claim: "Stale",
  appeal_needs_review: "Review",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/alerts")
      .then((r) => r.json())
      .then((d) => {
        setAlerts(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Notifications</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Alerts
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Action items: approaching deadlines, stale claims, and appeals needing review.
        </p>
      </header>

      {/* Summary */}
      <div className="mb-6 flex items-center gap-3 text-sm">
        <span className="rounded bg-ink-100 px-2 py-0.5 text-ink-600">
          {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
        </span>
        {critical > 0 && (
          <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">
            {critical} critical
          </span>
        )}
        {warning > 0 && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">
            {warning} warning{warning !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-ink-400">Checking for alerts...</p>
      ) : alerts.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <p className="text-sm text-green-700">All clear — no action items right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                SEVERITY_STYLES[a.severity] || "border-ink-200 bg-white"
              }`}
            >
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                SEVERITY_BADGE[a.severity] || "bg-ink-100 text-ink-600"
              }`}>
                {TYPE_LABELS[a.type] || a.type}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{a.title}</p>
                <p className="text-xs text-ink-500 truncate">{a.detail}</p>
              </div>
              {a.claim_id && (
                <Link
                  href={`/dashboard/claims/${a.claim_id}`}
                  className="shrink-0 rounded border border-ink-300/40 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                >
                  View claim
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
