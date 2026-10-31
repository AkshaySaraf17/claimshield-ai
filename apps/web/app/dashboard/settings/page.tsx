"use client";

import { useEffect, useState } from "react";

interface Preferences {
  [key: string]: string;
}

const PREF_LABELS: Record<string, { label: string; type: "toggle" | "select" | "number"; options?: string[] }> = {
  notification_email: { label: "Email Notifications", type: "toggle" },
  notification_deadline_days: { label: "Deadline Warning (days)", type: "number" },
  default_view: {
    label: "Default Dashboard View",
    type: "select",
    options: ["claims", "dashboard", "appeals", "deadlines", "analytics"],
  },
  items_per_page: {
    label: "Items Per Page",
    type: "select",
    options: ["10", "25", "50", "100"],
  },
  theme: {
    label: "Theme",
    type: "select",
    options: ["light", "dark", "system"],
  },
  auto_assign_appeals: { label: "Auto-Assign Appeals to Me", type: "toggle" },
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/preferences")
      .then((r) => r.json())
      .then((d) => {
        setPrefs(d);
        setLoading(false);
      });
  }, []);

  async function updatePref(key: string, value: string) {
    setSaving(key);
    setPrefs((p) => ({ ...p, [key]: value }));
    await fetch(`/api/v1/preferences/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    setSaving(null);
    setSaved(key);
    setTimeout(() => setSaved(null), 1500);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-ink-500">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink-950 mb-8">
        Settings
      </h1>

      <div className="space-y-1">
        {Object.entries(PREF_LABELS).map(([key, config]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-5 py-4"
          >
            <div>
              <p className="text-sm font-medium text-ink-900">{config.label}</p>
              {saving === key && (
                <span className="text-xs text-ink-400">Saving...</span>
              )}
              {saved === key && (
                <span className="text-xs text-green-600">Saved</span>
              )}
            </div>

            {config.type === "toggle" && (
              <button
                onClick={() =>
                  updatePref(key, prefs[key] === "true" ? "false" : "true")
                }
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  prefs[key] === "true" ? "bg-indigo-600" : "bg-ink-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    prefs[key] === "true" ? "translate-x-5" : ""
                  }`}
                />
              </button>
            )}

            {config.type === "select" && (
              <select
                value={prefs[key] || ""}
                onChange={(e) => updatePref(key, e.target.value)}
                className="rounded border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900"
              >
                {config.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {config.type === "number" && (
              <input
                type="number"
                min={1}
                max={90}
                value={prefs[key] || ""}
                onChange={(e) => updatePref(key, e.target.value)}
                className="w-20 rounded border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900 text-right"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-ink-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-ink-900 mb-3">Account Info</h2>
        <div className="space-y-2 text-sm text-ink-600">
          <p>User ID: <span className="font-mono text-ink-900">dev-user-001</span></p>
          <p>Tenant: <span className="font-mono text-ink-900">00000000-0000-0000-0000-000000000001</span></p>
          <p>Role: <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">biller</span></p>
        </div>
      </div>
    </div>
  );
}
