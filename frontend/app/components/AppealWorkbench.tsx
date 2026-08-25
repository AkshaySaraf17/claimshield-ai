"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { spring, tapScale, focusNudge } from "../lib/motion";

type DenialSummary = {
  denial_code: string;
  denial_reason: string;
  payer_name: string;
  amount_denied: number;
};

type AppealResponse = {
  status: string;
  denial_summary: DenialSummary;
  generated_appeal: string;
  requires_human_review: boolean;
};

const crossFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

function MotionTextarea({
  value,
  onChange,
  rows,
  placeholder,
  required,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows: number;
  placeholder: string;
  required?: boolean;
  className: string;
}) {
  return (
    <motion.textarea
      whileFocus={focusNudge}
      transition={spring}
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}

function ResultPanel({
  result,
  onEditAppeal,
  approved,
  onApproveChange,
}: {
  result: AppealResponse;
  onEditAppeal: (text: string) => void;
  approved: boolean;
  onApproveChange: (v: boolean) => void;
}) {
  return (
    <motion.div
      key="result"
      {...crossFade}
      className="mt-4 flex flex-col gap-4"
    >
      {/* Denial summary card — cascading reveal */}
      <div className="animate-entrance stagger-0 flex items-center justify-between rounded-sm border border-ink-300/40 bg-parchment/50 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">
            {result.denial_summary.payer_name}
          </p>
          <p className="mt-0.5 text-sm text-ink-700">
            {result.denial_summary.denial_reason}
          </p>
        </div>
        <div className="text-right">
          <span className="rounded-sm border border-denial-500/40 bg-denial-50 px-2 py-1 font-mono text-xs font-medium text-denial-600">
            {result.denial_summary.denial_code}
          </span>
          <p className="mt-1 font-mono text-sm font-medium text-ink-950">
            ${result.denial_summary.amount_denied.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Appeal letter */}
      <div className="animate-entrance stagger-1">
        <h3 className="text-sm font-semibold text-ink-700">
          Drafted appeal letter
        </h3>
        <MotionTextarea
          value={result.generated_appeal}
          onChange={(e) => onEditAppeal(e.target.value)}
          rows={12}
          placeholder=""
          className="mt-1 w-full rounded-sm border border-ink-300/50 p-3 font-mono text-xs focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
        />
      </div>

      {/* Approval checkbox */}
      <label className="animate-entrance stagger-2 flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => onApproveChange(e.target.checked)}
          className="h-4 w-4 rounded border-ink-300 text-ledger-600 focus:ring-ledger-500"
        />
        I have reviewed this letter for accuracy and it is ready to
        send.
      </label>

      {/* Approve button */}
      <motion.button
        whileTap={tapScale}
        transition={spring}
        type="button"
        disabled={!approved}
        className="animate-entrance stagger-3 rounded-sm bg-ink-950 px-4 py-2 font-medium text-white transition-colors hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Mark approved — wire to send/export next
      </motion.button>
    </motion.div>
  );
}

export default function AppealWorkbench() {
  const [denialText, setDenialText] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppealResponse | null>(null);
  const [approved, setApproved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setApproved(false);

    try {
      const res = await fetch("/api/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          denial_text: denialText,
          clinical_notes: clinicalNotes,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Request failed with ${res.status}`);
      }

      const data: AppealResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Intake form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-sm border border-ink-300/40 bg-white p-6"
      >
        <h2 className="font-display text-lg font-semibold text-ink-950">Intake</h2>

        <label className="text-sm font-medium text-ink-700">
          Denial letter text
          <MotionTextarea
            required
            value={denialText}
            onChange={(e) => setDenialText(e.target.value)}
            rows={6}
            placeholder="Paste the EOB / denial letter text here..."
            className="mt-1 w-full rounded-sm border border-ink-300/50 bg-parchment/40 p-3 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
          />
        </label>

        <label className="text-sm font-medium text-ink-700">
          Clinical notes (de-identified)
          <MotionTextarea
            required
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            rows={6}
            placeholder="Paste the relevant encounter notes here..."
            className="mt-1 w-full rounded-sm border border-ink-300/50 bg-parchment/40 p-3 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
          />
        </label>

        <motion.button
          whileTap={tapScale}
          transition={spring}
          type="submit"
          disabled={loading}
          className="mt-2 rounded-sm bg-ledger-600 px-4 py-2 font-medium text-white transition-colors hover:bg-ledger-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Reading the file..." : "Draft the appeal"}
        </motion.button>

        <AnimatePresence>
          {error && (
            <motion.p
              key="error"
              {...crossFade}
              className="rounded-sm bg-denial-50 p-3 text-sm text-denial-600"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </form>

      {/* Result panel */}
      <div className="rounded-sm border border-ink-300/40 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-950">Review before sending</h2>

        <AnimatePresence mode="wait">
          {!result && !loading && (
            <motion.p
              key="empty"
              {...crossFade}
              className="mt-4 text-sm text-ink-500"
            >
              Submit a denial on the left. The extracted case summary and a
              drafted appeal will appear here for review.
            </motion.p>
          )}

          {loading && (
            <motion.div
              key="skeleton"
              {...crossFade}
              className="mt-4 space-y-2"
            >
              <div className="h-3 w-3/4 animate-pulse rounded bg-ink-300/30" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-ink-300/30" />
              <div className="h-3 w-full animate-pulse rounded bg-ink-300/30" />
            </motion.div>
          )}

          {result && (
            <ResultPanel
              result={result}
              onEditAppeal={(text) =>
                setResult({ ...result, generated_appeal: text })
              }
              approved={approved}
              onApproveChange={setApproved}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
