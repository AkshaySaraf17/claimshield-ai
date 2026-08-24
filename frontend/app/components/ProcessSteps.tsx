"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    num: "01",
    title: "Parse",
    desc: "Paste the denial letter. AI identifies the code, payer, amount, and reason in seconds.",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16">
        <rect x="12" y="8" width="32" height="42" rx="4" stroke="#186047" strokeWidth="2" />
        <path d="M20,18 H36 M20,26 H36 M20,34 H30" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
        <path d="M36,36 L44,28 L52,36 L44,44 Z" fill="#eef6f3" stroke="#186047" strokeWidth="2" />
        <path d="M44,34 V38 M44,30 V32" stroke="#186047" strokeWidth="2" strokeLinecap="round" />
        <path d="M12,50 H44" stroke="#186047" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Research",
    desc: "The compliance agent cross-references payer policy to find the clinical evidence that supports reversal.",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16">
        <rect x="8" y="12" width="28" height="36" rx="3" stroke="#1f7a5c" strokeWidth="2" />
        <path d="M14,22 H30 M14,28 H30 M14,34 H24" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
        <path d="M36,16 L48,10 V32 C48,42 42,48 42,48 C42,48 36,42 36,32 Z" fill="#eef6f3" stroke="#186047" strokeWidth="2" />
        <path d="M40,26 L41.5,27.5 L45,23" stroke="#186047" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32,32 H36" stroke="#186047" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Draft",
    desc: "A formal appeal letter is generated — citing policy evidence and clinical notes. Staff reviews before anything sends.",
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16">
        <rect x="8" y="8" width="36" height="48" rx="4" stroke="#186047" strokeWidth="2" />
        <path d="M16,18 H36 M16,24 H36 M16,30 H36 M16,36 H28" stroke="#1f7a5c" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M28,44 L30,42 H36 V48 H30 Z" fill="#eef6f3" stroke="#186047" strokeWidth="1.5" />
        <circle cx="50" cy="16" r="10" fill="#eef6f3" stroke="#186047" strokeWidth="2" />
        <path d="M46,16 L49,19 L54,13" stroke="#186047" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function ProcessSteps() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      const cards = container.querySelectorAll(".step-card");
      cards.forEach((card, i) => {
        gsap.from(card, {
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
          opacity: 0,
          y: 40,
          duration: 0.6,
          delay: i * 0.15,
          ease: "power2.out",
        });
      });

      const connectors = container.querySelectorAll(".step-connector");
      connectors.forEach((conn) => {
        gsap.from(conn, {
          scrollTrigger: {
            trigger: conn,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
          scaleX: 0,
          duration: 0.5,
          ease: "power2.out",
        });
      });
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            How it works
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink-950 lg:text-4xl">
            Three agents, one appeal
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            Each denial moves through three specialised AI agents in sequence.
            The entire pipeline runs in under a minute.
          </p>
        </div>

        <div ref={containerRef} className="mt-16 flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-0">
          {steps.map((step, i) => (
            <div key={step.num} className="flex flex-1 items-center lg:flex-col">
              <div className="step-card flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-ledger-500/20 bg-ledger-50">
                  {step.icon}
                </div>
                <span className="mt-4 font-mono text-xs font-semibold text-ledger-600">
                  Step {step.num}
                </span>
                <h3 className="mt-1 font-display text-xl font-semibold text-ink-950">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-ink-500">
                  {step.desc}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className="step-connector mx-4 hidden h-px w-16 origin-left bg-ledger-500/30 lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
