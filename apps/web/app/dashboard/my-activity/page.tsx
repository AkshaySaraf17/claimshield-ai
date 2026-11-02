"use client";

import { useEffect, useState } from "react";

interface ActivityItem {
  id: number;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  "claim.create": "Created claim",
  "claim.update": "Updated claim",
  "claim.status_change": "Changed claim status",
  "claim.auto_route": "Auto-routed claim",
  "appeal.create": "Created appeal",
  "appeal.approve": "Approved appeal",
  "appeal.send": "Sent appeal",
  "note.create": "Added note",
  "comment.create": "Added comment",
  "claim_cost.create": "Recorded cost",
  "claim_link.create": "Linked claims",
  "routing_rule.create": "Created routing rule",
  "payer_contact.create": "Added payer contact",
  "tag.add": "Added tag",
  "tag.remove": "Removed tag",
  "response.record": "Recorded payer response",
  "escalation.create": "Escalated claim",
  "assignment.create": "Assigned claim",
};

export default function MyActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/my-activity")
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Personal</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">My Activity</h1>
        <p className="mt-1 text-sm text-ink-500">
          Your recent actions across all claims and appeals.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading activity...</p>
      ) : items.length === 0 ? (
        <p className="text-ink-400">No activity recorded yet.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">ID</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-ink-50">
                  <td className="px-4 py-3 text-sm text-ink-700">
                    {ACTION_LABELS[item.action] || item.action}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                      {item.resource_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">
                    {(item.resource_id ?? "").slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-ink-500">
                    {new Date(item.created_at).toLocaleString()}
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
