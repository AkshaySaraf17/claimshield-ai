"use client";

import { useEffect, useState } from "react";

const PREF_LABELS: Record<string, { label: string; description: string }> = {
  notif_deadline_warning: {
    label: "Deadline Warnings",
    description: "Get alerted when a filing deadline is approaching",
  },
  notif_status_change: {
    label: "Status Changes",
    description: "Notification when a claim status transitions",
  },
  notif_appeal_approved: {
    label: "Appeal Approvals",
    description: "Alert when an appeal draft is approved for sending",
  },
  notif_escalation: {
    label: "Escalations",
    description: "Notification when a claim is escalated for supervisor review",
  },
  notif_assignment: {
    label: "Assignments",
    description: "Alert when a claim is assigned to you",
  },
  notif_payer_response: {
    label: "Payer Responses",
    description: "Notification when a payer response is recorded",
  },
};

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/v1/notifications/preferences")
      .then((r) => r.json())
      .then((d) => {
        setPrefs(d);
        setLoading(false);
      });
  }, []);

  async function handleToggle(key: string) {
    const newVal = prefs[key] === "true" ? "false" : "true";
    const updated = { ...prefs, [key]: newVal };
    setPrefs(updated);
    setSaving(true);
    setSaved(false);
    await fetch("/api/v1/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: newVal }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Settings</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Notification Preferences
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Choose which events trigger notifications for your account.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading preferences...</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white divide-y divide-ink-100">
          {Object.entries(PREF_LABELS).map(([key, { label, description }]) => (
            <div key={key} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink-800">{label}</p>
                <p className="text-xs text-ink-500">{description}</p>
              </div>
              <button
                onClick={() => handleToggle(key)}
                disabled={saving}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  prefs[key] === "true" ? "bg-emerald-500" : "bg-ink-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    prefs[key] === "true" ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {saved && (
        <p className="mt-3 text-center text-xs text-emerald-600">Preferences saved.</p>
      )}
    </div>
  );
}
