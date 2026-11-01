"use client";

import { useEffect, useState } from "react";

const PREF_LABELS: Record<string, string> = {
  notif_deadline_warning: "Deadline Warnings",
  notif_status_change: "Status Changes",
  notif_appeal_approved: "Appeal Approvals",
  notif_escalation: "Escalations",
  notif_assignment: "New Assignments",
  notif_payer_response: "Payer Responses",
};

export default function NotifPrefsPage() {
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/notifications/preferences")
      .then((r) => r.json())
      .then((d) => {
        setPrefs(d || {});
        setLoading(false);
      });
  }, []);

  async function toggle(key: string) {
    const newVal = prefs[key] === "true" ? "false" : "true";
    setSaving(true);
    await fetch("/api/v1/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...prefs, [key]: newVal }),
    });
    setPrefs((p) => ({ ...p, [key]: newVal }));
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Settings</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Notification Preferences</h1>
        <p className="mt-1 text-sm text-ink-500">Control which notifications you receive.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading preferences...</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(PREF_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3">
              <span className="text-sm text-ink-700">{label}</span>
              <button
                onClick={() => toggle(key)}
                disabled={saving}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  prefs[key] === "true" ? "bg-green-500" : "bg-ink-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    prefs[key] === "true" ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
