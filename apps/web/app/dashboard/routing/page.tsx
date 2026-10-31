"use client";

import { useEffect, useState } from "react";

interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  match_payer: string | null;
  match_denial_code: string | null;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  assign_to: string;
  assign_to_name: string;
  is_active: boolean;
  created_at: string;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function RoutingPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    priority: "100",
    match_payer: "",
    match_denial_code: "",
    min_amount_cents: "",
    max_amount_cents: "",
    assign_to: "dev-user-001",
  });

  const fetchRules = () => {
    fetch("/api/v1/routing-rules")
      .then((r) => r.json())
      .then((d) => {
        setRules(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleCreate = async () => {
    const payload: Record<string, unknown> = {
      name: form.name,
      priority: parseInt(form.priority) || 100,
      assign_to: form.assign_to,
    };
    if (form.match_payer) payload.match_payer = form.match_payer;
    if (form.match_denial_code) payload.match_denial_code = form.match_denial_code;
    if (form.min_amount_cents) payload.min_amount_cents = parseInt(form.min_amount_cents);
    if (form.max_amount_cents) payload.max_amount_cents = parseInt(form.max_amount_cents);

    await fetch("/api/v1/routing-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowForm(false);
    setForm({ name: "", priority: "100", match_payer: "", match_denial_code: "", min_amount_cents: "", max_amount_cents: "", assign_to: "dev-user-001" });
    fetchRules();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/v1/routing-rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Automation</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Routing</h1>
          <p className="mt-1 text-sm text-ink-500">
            Auto-assign claims to team members based on payer, denial code, or amount.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
        >
          {showForm ? "Cancel" : "New Rule"}
        </button>
      </header>

      {showForm && (
        <div className="mb-6 rounded-lg border border-ink-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-700">Create Routing Rule</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-500 mb-1">Rule Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
                placeholder="e.g. High-value UnitedHealth"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Priority (lower = first)</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Match Payer</label>
              <input
                value={form.match_payer}
                onChange={(e) => setForm({ ...form, match_payer: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
                placeholder="e.g. Aetna (optional)"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Match Denial Code</label>
              <input
                value={form.match_denial_code}
                onChange={(e) => setForm({ ...form, match_denial_code: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
                placeholder="e.g. CO-16 (optional)"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Min Amount (cents)</label>
              <input
                type="number"
                value={form.min_amount_cents}
                onChange={(e) => setForm({ ...form, min_amount_cents: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
                placeholder="e.g. 100000 (optional)"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Max Amount (cents)</label>
              <input
                type="number"
                value={form.max_amount_cents}
                onChange={(e) => setForm({ ...form, max_amount_cents: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
                placeholder="e.g. 500000 (optional)"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Assign To</label>
              <select
                value={form.assign_to}
                onChange={(e) => setForm({ ...form, assign_to: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
              >
                <option value="dev-user-001">Alice Chen</option>
                <option value="dev-user-002">Bob Martinez</option>
                <option value="dev-user-003">Carol Williams</option>
                <option value="dev-user-004">David Kim</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!form.name}
            className="mt-3 rounded bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            Create Rule
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-ink-400">Loading routing rules...</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <p className="text-ink-500">No routing rules configured.</p>
          <p className="mt-1 text-xs text-ink-400">Create a rule to auto-assign incoming claims.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-5 py-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink-900">{r.name}</h3>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700">
                    P{r.priority}
                  </span>
                  {!r.is_active && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-3 text-xs text-ink-500">
                  {r.match_payer && <span>Payer: {r.match_payer}</span>}
                  {r.match_denial_code && <span>Code: {r.match_denial_code}</span>}
                  {r.min_amount_cents != null && <span>Min: {dollars(r.min_amount_cents)}</span>}
                  {r.max_amount_cents != null && <span>Max: {dollars(r.max_amount_cents)}</span>}
                  <span>Assign to: {r.assign_to_name}</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
