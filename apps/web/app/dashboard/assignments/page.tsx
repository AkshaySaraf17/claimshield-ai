"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

interface Assignment {
  id: string;
  claim_id: string;
  assigned_to: string;
  assignee_name: string;
  assigned_by: string;
  note: string | null;
  created_at: string;
  claim?: {
    claim_number: string | null;
    payer_name: string | null;
    denial_code: string | null;
    amount_denied_cents: number | null;
    status: string;
  };
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function AssignmentsPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/team-members").then((r) => r.json()),
      fetch("/api/v1/assignments").then((r) => r.json()),
    ]).then(([t, a]) => {
      setTeam(Array.isArray(t) ? t : []);
      setAssignments(Array.isArray(a) ? a : []);
      setLoading(false);
    });
  }, []);

  const filtered = filterUser
    ? assignments.filter((a) => a.assigned_to === filterUser)
    : assignments;

  const countByUser = team.map((m) => ({
    ...m,
    count: assignments.filter((a) => a.assigned_to === m.id).length,
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Team
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Claim Assignments
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          View and manage claim-to-user assignments. Assign claims from the
          claim detail page.
        </p>
      </header>

      {/* Team summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {countByUser.map((m) => (
          <button
            key={m.id}
            onClick={() => setFilterUser(filterUser === m.id ? "" : m.id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filterUser === m.id
                ? "border-indigo-400 bg-indigo-50"
                : "border-ink-200 bg-white hover:bg-ink-50"
            }`}
          >
            <p className="text-sm font-medium text-ink-900">{m.name}</p>
            <p className="text-xs text-ink-500">{m.role}</p>
            <p className="mt-1 text-lg font-semibold text-ink-800">
              {m.count}
            </p>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-400">Loading assignments...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-400">
            {filterUser
              ? "No assignments for this team member."
              : "No assignments yet. Assign claims from the claim detail page."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                  Claim
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                  Assigned To
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                  Payer
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-ink-600">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                  Note
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-600">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-ink-100 last:border-0 hover:bg-ink-50"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/claims/${a.claim_id}`}
                      className="font-mono text-xs text-indigo-600 hover:underline"
                    >
                      {a.claim?.claim_number || a.claim_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-700">{a.assignee_name}</td>
                  <td className="px-3 py-2 text-ink-600">
                    {a.claim?.payer_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {dollars(a.claim?.amount_denied_cents ?? null)}
                  </td>
                  <td className="px-3 py-2">
                    {a.claim?.status && (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          STATUS_COLORS[a.claim.status] ||
                          "bg-ink-100 text-ink-600"
                        }`}
                      >
                        {a.claim.status.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-500 truncate max-w-[150px]">
                    {a.note || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-500">
                    {a.created_at
                      ? new Date(a.created_at).toLocaleDateString()
                      : "—"}
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
