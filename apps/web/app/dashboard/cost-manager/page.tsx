"use client";

import { useEffect, useState, useCallback } from "react";

interface CostItem {
  id: string;
  category: string;
  description: string;
  amount_cents: number;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
}

interface CostsData {
  claim_id: string;
  total_cents: number;
  items: CostItem[];
}

const COST_CATEGORIES = ["staff_time", "filing_fee", "legal", "copying", "postage", "other"];

export default function CostManagerPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("staff_time");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  const loadCosts = useCallback(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/costs`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.claim_id ? d : null);
        setLoading(false);
      });
  }, [claimId]);

  useEffect(() => { loadCosts(); }, [loadCosts]);

  async function addCost(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!description.trim() || isNaN(cents) || cents <= 0) return;
    await fetch(`/api/v1/claims/${claimId}/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, description: description.trim(), amount_cents: cents }),
    });
    setDescription("");
    setAmount("");
    loadCosts();
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Finance</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Cost Manager</h1>
        <p className="mt-1 text-sm text-ink-500">Track appeal-related costs per claim.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {data && (
        <div className="mb-6 rounded-lg border border-ink-200 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-ink-500">Total Costs</span>
          <span className="text-2xl font-bold text-ink-900">{fmt(data.total_cents)}</span>
        </div>
      )}

      <form onSubmit={addCost} className="mb-6 flex gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-ink-200 px-2 py-2 text-sm">
          {COST_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
          ))}
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="flex-1 rounded border border-ink-200 px-3 py-2 text-sm" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ Amount" type="number" step="0.01" min="0" className="w-28 rounded border border-ink-200 px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900">Add</button>
      </form>

      {loading ? (
        <p className="text-ink-400">Loading costs...</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-ink-400">No costs recorded for this claim.</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => (
            <div key={item.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{item.category.replace(/_/g, " ")}</span>
                  <span className="text-sm font-medium text-ink-800">{item.description}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-400">By {item.recorded_by_name} — {new Date(item.created_at).toLocaleDateString()}</p>
              </div>
              <span className="text-sm font-mono font-bold text-ink-900">{fmt(item.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
