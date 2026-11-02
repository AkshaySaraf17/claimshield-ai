"use client";

import { useEffect, useState } from "react";

interface UserSummary {
  user_id: string;
  role: string;
  actions: number;
  last_action: string | null;
}

interface ActionCount {
  action: string;
  count: number;
}

interface DailyCount {
  date: string;
  count: number;
}

interface RecentEntry {
  id: number;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  detail: string | null;
  created_at: string;
}

interface ActivityData {
  period_days: number;
  total_actions: number;
  users: UserSummary[];
  actions: ActionCount[];
  daily: DailyCount[];
  recent: RecentEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  "claim.created": "bg-blue-100 text-blue-700",
  "claim.status_changed": "bg-amber-100 text-amber-700",
  "appeal.drafted": "bg-indigo-100 text-indigo-700",
  "appeal.approved": "bg-green-100 text-green-700",
  "appeal.sent": "bg-emerald-100 text-emerald-700",
};

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/analytics/user-activity?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [days]);

  const maxDaily = data
    ? Math.max(...data.daily.map((d) => d.count), 1)
    : 1;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Team
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
            User Activity
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Audit-derived activity metrics for your team.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-500">Period</label>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-2.5 py-1 text-xs ${
                days === d
                  ? "bg-ink-950 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading activity data...</p>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Total Actions</p>
              <p className="mt-1 text-2xl font-semibold text-ink-900">
                {data.total_actions}
              </p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Active Users</p>
              <p className="mt-1 text-2xl font-semibold text-ink-900">
                {data.users.length}
              </p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Action Types</p>
              <p className="mt-1 text-2xl font-semibold text-ink-900">
                {data.actions.length}
              </p>
            </div>
          </div>

          {/* Daily activity chart */}
          {data.daily.length > 0 && (
            <div className="mb-6 rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink-700">
                Daily Activity
              </h2>
              <div className="flex items-end gap-1" style={{ height: 100 }}>
                {data.daily.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors"
                    style={{
                      height: `${(d.count / maxDaily) * 100}%`,
                      minHeight: d.count > 0 ? 4 : 0,
                    }}
                    title={`${d.date}: ${d.count} actions`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-ink-400">
                <span>{data.daily[0]?.date}</span>
                <span>{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Per-user breakdown */}
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink-700">
                By User
              </h2>
              <div className="space-y-2">
                {data.users.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink-800">
                        {u.user_id}
                      </p>
                      <p className="text-xs text-ink-500">{u.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-900">
                        {u.actions}
                      </p>
                      <p className="text-[10px] text-ink-400">actions</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By action type */}
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink-700">
                By Action Type
              </h2>
              <div className="space-y-2">
                {data.actions.map((a) => (
                  <div key={a.action} className="flex items-center justify-between">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        ACTION_COLORS[a.action] || "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {a.action}
                    </span>
                    <span className="text-sm font-semibold text-ink-800">
                      {a.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="mt-6 rounded-lg border border-ink-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-700">
              Recent Activity
            </h2>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.recent.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="shrink-0 font-mono text-[10px] text-ink-400 w-28">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      ACTION_COLORS[e.action] || "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {e.action}
                  </span>
                  <span className="text-xs text-ink-600 truncate">
                    {e.resource_type} {(e.resource_id ?? "").slice(0, 8)}
                  </span>
                  <span className="text-xs text-ink-400">{e.actor_id}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-ink-400">No activity data available.</p>
      )}
    </div>
  );
}
