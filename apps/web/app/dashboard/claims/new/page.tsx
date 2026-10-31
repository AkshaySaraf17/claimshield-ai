"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ClaimEntry {
  claim_number: string;
  payer_name: string;
  denial_code: string;
  denial_reason: string;
  raw_denial_text: string;
  raw_clinical_notes: string;
  amount_denied_cents: string;
  patient_id: string;
}

const EMPTY_ENTRY: ClaimEntry = {
  claim_number: "",
  payer_name: "",
  denial_code: "",
  denial_reason: "",
  raw_denial_text: "",
  raw_clinical_notes: "",
  amount_denied_cents: "",
  patient_id: "",
};

export default function NewClaimsPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<ClaimEntry[]>([{ ...EMPTY_ENTRY }]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateEntry(index: number, field: keyof ClaimEntry, value: string) {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addEntry() {
    setEntries((prev) => [...prev, { ...EMPTY_ENTRY }]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const valid = entries.filter(
      (e) => e.raw_denial_text.trim() && e.raw_clinical_notes.trim()
    );
    if (valid.length === 0) {
      setError("At least one claim must have denial text and clinical notes");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        claims: valid.map((e) => ({
          claim_number: e.claim_number || undefined,
          payer_name: e.payer_name || undefined,
          denial_code: e.denial_code || undefined,
          denial_reason: e.denial_reason || undefined,
          raw_denial_text: e.raw_denial_text,
          raw_clinical_notes: e.raw_clinical_notes,
          amount_denied_cents: e.amount_denied_cents
            ? Math.round(parseFloat(e.amount_denied_cents) * 100)
            : undefined,
          patient_id: e.patient_id || undefined,
        })),
      };

      const isBulk = valid.length > 1;
      if (isBulk) {
        const res = await fetch("/api/v1/claims/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Bulk creation failed");
        const data = await res.json();
        setResult({ created: data.created });
      } else {
        const item = payload.claims[0];
        const res = await fetch("/api/v1/claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error("Claim creation failed");
        setResult({ created: 1 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8">
          <h2 className="text-xl font-semibold text-green-800">
            {result.created} claim{result.created > 1 ? "s" : ""} created
          </h2>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => {
                setResult(null);
                setEntries([{ ...EMPTY_ENTRY }]);
              }}
              className="rounded border border-ink-300 px-4 py-2 text-sm text-ink-600 hover:bg-ink-100"
            >
              Create more
            </button>
            <Link
              href="/dashboard/claims"
              className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900"
            >
              View claims
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard/claims" className="text-sm text-ink-500 hover:text-ink-700">
            &larr; Back to claims
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink-950">
            New Claims
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addEntry}
            className="rounded border border-ink-300 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
          >
            + Add row
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded bg-ink-950 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-900 disabled:opacity-50"
          >
            {submitting
              ? "Creating..."
              : `Create ${entries.length} claim${entries.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="space-y-4">
        {entries.map((entry, i) => (
          <div key={i} className="rounded-lg border border-ink-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-ink-700">
                Claim {i + 1}
              </span>
              {entries.length > 1 && (
                <button
                  onClick={() => removeEntry(i)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field
                label="Claim #"
                value={entry.claim_number}
                onChange={(v) => updateEntry(i, "claim_number", v)}
                placeholder="CLM-2024-XXX"
              />
              <Field
                label="Patient ID"
                value={entry.patient_id}
                onChange={(v) => updateEntry(i, "patient_id", v)}
                placeholder="PAT-XXX"
              />
              <Field
                label="Payer"
                value={entry.payer_name}
                onChange={(v) => updateEntry(i, "payer_name", v)}
                placeholder="e.g. Aetna"
              />
              <Field
                label="Amount ($)"
                value={entry.amount_denied_cents}
                onChange={(v) => updateEntry(i, "amount_denied_cents", v)}
                placeholder="1500.00"
                type="number"
              />
              <Field
                label="Denial Code"
                value={entry.denial_code}
                onChange={(v) => updateEntry(i, "denial_code", v)}
                placeholder="CO-50"
              />
              <Field
                label="Denial Reason"
                value={entry.denial_reason}
                onChange={(v) => updateEntry(i, "denial_reason", v)}
                placeholder="Medical necessity"
                className="col-span-3"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">
                  Denial Text *
                </label>
                <textarea
                  value={entry.raw_denial_text}
                  onChange={(e) =>
                    updateEntry(i, "raw_denial_text", e.target.value)
                  }
                  rows={3}
                  placeholder="Paste the denial text from the EOB..."
                  className="w-full rounded border border-ink-300/50 px-3 py-2 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">
                  Clinical Notes *
                </label>
                <textarea
                  value={entry.raw_clinical_notes}
                  onChange={(e) =>
                    updateEntry(i, "raw_clinical_notes", e.target.value)
                  }
                  rows={3}
                  placeholder="Relevant clinical documentation..."
                  className="w-full rounded border border-ink-300/50 px-3 py-2 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-ink-500">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-ink-300/50 px-2 py-1.5 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
      />
    </div>
  );
}
