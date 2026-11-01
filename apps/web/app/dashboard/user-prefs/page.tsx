"use client";

import { useEffect, useState } from "react";

const PREF_CONFIG: { key: string; label: string; type: "text" | "select" | "toggle"; options?: string[] }[] = [
  { key: "notification_email", label: "Email Notifications", type: "toggle" },
  { key: "notification_deadline_days", label: "Deadline Warning (days)", type: "text" },
  { key: "default_view", label: "Default View", type: "select", options: ["claims", "dashboard", "pipeline", "workbench"] },
  { key: "items_per_page", label: "Items Per Page", type: "select", options: ["10", "25", "50", "100"] },
  { key: "theme", label: "Theme", type: "select", options: ["light", "dark", "system"] },
  { key: "auto_assign_appeals", label: "Auto-Assign Appeals", type: "toggle" },
];

export default function UserPrefsPage() {
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/preferences")
      .then((r) => r.json())
      .then((d) => {
        setPrefs(d || {});
        setLoading(false);
      });
  }, []);

  async function updatePref(key: string, value: string) {
    setSaving(key);
    await fetch(`/api/v1/preferences/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Settings</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">User Preferences</h1>
        <p className="mt-1 text-sm text-ink-500">Customize your ClaimShield experience.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading preferences...</p>
      ) : (
        <div className="space-y-2">
          {PREF_CONFIG.map(({ key, label, type, options }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3">
              <span className="text-sm text-ink-700">{label}</span>
              {type === "toggle" ? (
                <button
                  onClick={() => updatePref(key, prefs[key] === "true" ? "false" : "true")}
                  disabled={saving === key}
                  className={`relative h-6 w-11 rounded-full transition-colors ${prefs[key] === "true" ? "bg-green-500" : "bg-ink-300"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${prefs[key] === "true" ? "left-[22px]" : "left-0.5"}`} />
                </button>
              ) : type === "select" ? (
                <select
                  value={prefs[key] || ""}
                  onChange={(e) => updatePref(key, e.target.value)}
                  disabled={saving === key}
                  className="rounded border border-ink-200 px-2 py-1 text-sm"
                >
                  {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  value={prefs[key] || ""}
                  onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.value }))}
                  onBlur={(e) => updatePref(key, e.target.value)}
                  className="w-20 rounded border border-ink-200 px-2 py-1 text-sm text-right"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
