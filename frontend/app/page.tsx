"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { spring, tapScale } from "./lib/motion";
import ScrollShowcase from "./components/ScrollShowcase";
import ProcessSteps from "./components/ProcessSteps";
import FeatureGrid from "./components/FeatureGrid";

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
        <span className="animate-entrance stagger-0 rounded-sm border border-ink-300 bg-white px-3 py-1 font-mono text-xs tracking-wide text-ink-500">
          DENIAL CODE CO-50 &middot; REVERSED ON APPEAL
        </span>

        <h1 className="animate-entrance stagger-1 mt-6 font-display text-5xl font-semibold leading-tight text-ink-950">
          Every denial is a draft
          <br />
          waiting for evidence.
        </h1>

        <p className="animate-entrance stagger-2 mt-5 max-w-md text-base leading-relaxed text-ink-500">
          ClaimShield reads the EOB, matches it against payer policy, and
          drafts the appeal. Your billing staff signs off on every letter
          before it ever leaves the building.
        </p>

        <div className="animate-entrance stagger-3 mt-9">
          <Link href="/dashboard">
            <motion.span
              whileTap={tapScale}
              transition={spring}
              className="inline-block rounded-sm bg-ledger-600 px-6 py-3 font-body font-medium text-white transition-colors hover:bg-ledger-700"
            >
              Open the workbench
            </motion.span>
          </Link>
        </div>

        {/* Scroll hint */}
        <div className="animate-entrance stagger-5 mt-20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="mx-auto h-6 w-6 animate-bounce text-ink-300"
          >
            <path
              d="M12,5 V19 M19,12 L12,19 L5,12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </main>

      {/* ── Scroll-driven product showcase ── */}
      <ScrollShowcase />

      {/* ── How it works ── */}
      <ProcessSteps />

      {/* ── Feature grid with search ── */}
      <FeatureGrid />

      {/* ── Final CTA ── */}
      <section className="bg-ink-950 py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-display text-3xl font-semibold text-white lg:text-4xl">
            Ready to turn denials into revenue?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-300">
            Paste your first denial letter and see the appeal draft in under a
            minute. No account needed — everything runs locally.
          </p>
          <Link href="/dashboard">
            <motion.span
              whileTap={tapScale}
              transition={spring}
              className="mt-8 inline-block rounded-sm bg-ledger-600 px-8 py-4 font-body text-lg font-medium text-white transition-colors hover:bg-ledger-700"
            >
              Try the workbench now
            </motion.span>
          </Link>
          <div className="ledger-rule mx-auto mt-16 max-w-xs opacity-30" />
          <p className="mt-4 text-xs text-ink-500">
            No letter is sent automatically. Staff review is required on every
            case.
          </p>
        </div>
      </section>
    </>
  );
}
