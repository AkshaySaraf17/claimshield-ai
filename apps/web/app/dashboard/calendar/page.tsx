"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CalendarEvent {
  claim_id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  amount_denied_cents: number | null;
  status: string;
  created_at: string;
  deadline_date: string;
  deadline_days: number;
  days_remaining: number;
  is_overdue: boolean;
  is_urgent: boolean;
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [urgent, setUrgent] = useState(0);
  const [payerDeadlines, setPayerDeadlines] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "overdue" | "urgent" | "ok">("all");

  useEffect(() => {
    fetch("/api/v1/calendar/deadlines")
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events || []);
        setOverdue(d.overdue || 0);
        setUrgent(d.urgent || 0);
        setPayerDeadlines(d.payer_deadlines || {});
        setLoading(false);
      });
  }, []);

  const filtered = events.filter((e) => {
    if (filter === "overdue") return e.is_overdue;
    if (filter === "urgent") return e.is_urgent;
    if (filter === "ok") return !e.is_overdue && !e.is_urgent;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Compliance
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Filing Deadline Calendar
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Track filing deadlines per payer. Deadlines are computed from claim
          creation date using each payer&apos;s known filing limit.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading deadlines...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                filter === "overdue"
                  ? "border-red-400 bg-red-50"
                  : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <p className="text-2xl font-semibold text-red-600">{overdue}</p>
              <p className="text-xs text-ink-500">Overdue</p>
            </button>
            <button
              onClick={() => setFilter(filter === "urgent" ? "all" : "urgent")}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                filter === "urgent"
                  ? "border-amber-400 bg-amber-50"
                  : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <p className="text-2xl font-semibold text-amber-600">{urgent}</p>
              <p className="text-xs text-ink-500">Due within 14 days</p>
            </button>
            <button
              onClick={() => setFilter(filter === "ok" ? "all" : "ok")}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                filter === "ok"
                  ? "border-green-400 bg-green-50"
                  : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <p className="text-2xl font-semibold text-green-600">
                {events.length - overdue - urgent}
              </p>
              <p className="text-xs text-ink-500">On track</p>
            </button>
          </div>

          {/* Payer deadline reference */}
          <div className="mb-6 rounded-lg border border-ink-200 bg-white p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Payer Filing Limits
            </h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(payerDeadlines).map(([payer, days]) => (
                <span
                  key={payer}
                  className="rounded border border-ink-200 px-2 py-1 text-xs text-ink-600"
                >
                  {payer}: <strong>{days}d</strong>
                </span>
              ))}
              <span className="rounded border border-dashed border-ink-300 px-2 py-1 text-xs text-ink-400">
                Default: 90d
              </span>
            </div>
          </div>

          {/* Events list */}
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">
              No claims match the current filter.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <div
                  key={e.claim_id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    e.is_overdue
                      ? "border-red-200 bg-red-50/50"
                      : e.is_urgent
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-ink-200 bg-white"
                  }`}
                >
                  {/* Days indicator */}
                  <div className="w-16 shrink-0 text-center">
                    <p
                      className={`text-lg font-semibold ${
                        e.is_overdue
                          ? "text-red-600"
                          : e.is_urgent
                          ? "text-amber-600"
                          : "text-green-600"
                      }`}
                    >
                      {e.is_overdue
                        ? `${Math.abs(e.days_remaining)}d`
                        : `${e.days_remaining}d`}
                    </p>
                    <p className="text-[10px] text-ink-400">
                      {e.is_overdue ? "overdue" : "left"}
                    </p>
                  </div>

                  {/* Claim info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/claims/${e.claim_id}`}
                        className="font-mono text-sm font-medium text-indigo-600 hover:underline"
                      >
                        {e.claim_number || e.claim_id.slice(0, 8)}
                      </Link>
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                        {e.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-0.5 flex gap-3 text-xs text-ink-500">
                      <span>{e.payer_name}</span>
                      <span className="font-mono">{e.denial_code}</span>
                      <span className="font-mono">
                        {dollars(e.amount_denied_cents)}
                      </span>
                    </div>
                  </div>

                  {/* Deadline date */}
                  <div className="shrink-0 text-right text-xs text-ink-500">
                    <p>Deadline: {formatDate(e.deadline_date)}</p>
                    <p className="text-[10px] text-ink-400">
                      Filed: {formatDate(e.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
