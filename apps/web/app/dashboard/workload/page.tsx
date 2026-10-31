"use client";

import { useEffect, useState } from "react";

interface UserWorkload {
  user_id: string;
  user_name: string;
  total: number;
  active: number;
  pending_review: number;
  total_value_cents: number;
}

export default function WorkloadPage() {
  const [data, setData] = useState<UserWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/workload")
      .then((r) => r.json())
      .then((d) => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const totalActive = data.reduce((s, u) => s + u.active, 0);
  const totalValue = data.reduce((s, u) => s + u.total_value_cents, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Team</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Workload</h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims assigned per team member with active case counts and value.
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
          <p className="text-xs text-ink-500">Team Members</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{data.length}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
          <p className="text-xs text-ink-500">Active Claims</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{totalActive}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
          <p className="text-xs text-ink-500">Total Value at Stake</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">
            ${(totalValue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading workload...</p>
      ) : data.length === 0 ? (
        <p className="text-ink-400">No assignments found.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Team Member</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Total</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Active</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Pending Review</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.user_id} className="border-t border-ink-50">
                  <td className="px-4 py-3 font-medium text-ink-800">{u.user_name}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{u.total}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                      u.active > 5 ? "bg-red-100 text-red-700" : u.active > 2 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    }`}>
                      {u.active}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-600">{u.pending_review}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-ink-600">
                    ${(u.total_value_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
