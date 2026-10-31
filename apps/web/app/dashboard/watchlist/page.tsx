"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WatchItem {
  watchlist_id: string;
  claim_id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  status: string;
  amount_denied_cents: number | null;
  added_at: string;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = () => {
    fetch("/api/v1/watchlist")
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleRemove = async (watchlistId: string) => {
    await fetch(`/api/v1/watchlist/${watchlistId}`, { method: "DELETE" });
    fetchItems();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">My Claims</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Watchlist</h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims you are tracking for quick access.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading watchlist...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <p className="text-ink-500">Your watchlist is empty.</p>
          <p className="mt-1 text-xs text-ink-400">Star claims from the claim detail page to add them here.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div
              key={item.watchlist_id}
              className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-5 py-4"
            >
              <div>
                <Link
                  href={`/dashboard/claims/${item.claim_id}`}
                  className="text-sm font-semibold text-indigo-700 hover:underline"
                >
                  {item.claim_number || item.claim_id.slice(0, 8)}
                </Link>
                <div className="mt-1 flex gap-3 text-xs text-ink-500">
                  {item.payer_name && <span>{item.payer_name}</span>}
                  {item.denial_code && (
                    <span className="rounded border border-ink-200 px-1 py-0.5 font-mono">{item.denial_code}</span>
                  )}
                  <span className="rounded bg-ink-100 px-1.5 py-0.5">{item.status}</span>
                  {item.amount_denied_cents != null && (
                    <span className="text-red-600">{dollars(item.amount_denied_cents)}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemove(item.watchlist_id)}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Unwatch
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
