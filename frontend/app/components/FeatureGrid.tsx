"use client";

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ── Feature icon SVGs ── */
const icons: Record<string, JSX.Element> = {
  parser: (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
      <rect x="10" y="6" width="22" height="30" rx="3" stroke="#1f7a5c" strokeWidth="2" />
      <path d="M16,14 H26 M16,20 H26 M16,26 H22" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="34" cy="34" r="8" stroke="#186047" strokeWidth="2" />
      <path d="M40,40 L44,44" stroke="#186047" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  policy: (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
      <path d="M8,8 H32 V40 H8 Z" stroke="#1f7a5c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12,6 V10 M18,6 V10 M24,6 V10" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
      <path d="M14,18 H26 M14,24 H26 M14,30 H22" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
      <path d="M30,24 L38,20 V34 C38,38 34,40 34,40 C34,40 30,38 30,34 Z" fill="#eef6f3" stroke="#186047" strokeWidth="2" />
      <path d="M33,30 L34.5,31.5 L37,28" stroke="#186047" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  writer: (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
      <rect x="10" y="8" width="24" height="32" rx="2" stroke="#1f7a5c" strokeWidth="2" />
      <path d="M16,16 H28 M16,22 H28 M16,28 H24" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
      <path d="M34,18 L40,12 L44,16 L38,22 Z" fill="#eef6f3" stroke="#186047" strokeWidth="2" strokeLinejoin="round" />
      <path d="M34,22 L33,26 L37,23" fill="#186047" />
    </svg>
  ),
  compliance: (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
      <path d="M24,4 L42,14 V26 C42,38 24,44 24,44 C24,44 6,38 6,26 V14 Z" stroke="#1f7a5c" strokeWidth="2" />
      <path d="M24,10 L36,17 V26 C36,34 24,39 24,39 C24,39 12,34 12,26 V17 Z" fill="#eef6f3" />
      <path d="M17,24 L22,29 L31,19" stroke="#186047" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  tracking: (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
      <rect x="6" y="6" width="36" height="36" rx="4" stroke="#1f7a5c" strokeWidth="2" />
      <path d="M6,16 H42" stroke="#1f7a5c" strokeWidth="2" />
      <rect x="12" y="22" width="6" height="14" rx="1" fill="#eef6f3" stroke="#186047" strokeWidth="1.5" />
      <rect x="21" y="26" width="6" height="10" rx="1" fill="#eef6f3" stroke="#186047" strokeWidth="1.5" />
      <rect x="30" y="20" width="6" height="16" rx="1" fill="#eef6f3" stroke="#186047" strokeWidth="1.5" />
      <circle cx="36" cy="10" r="2" fill="#186047" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
      <circle cx="24" cy="16" r="8" stroke="#1f7a5c" strokeWidth="2" />
      <path d="M10,40 C10,32 18,28 24,28 C30,28 38,32 38,40" stroke="#1f7a5c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="34" r="7" fill="#eef6f3" stroke="#186047" strokeWidth="2" />
      <path d="M33,34 L35,36 L39,32" stroke="#186047" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

type Feature = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  tags: string[];
};

const features: Feature[] = [
  {
    id: "parser",
    icon: "parser",
    title: "Smart Document Parser",
    desc: "AI extracts denial codes, payer names, and billed amounts from any EOB format — no manual data entry.",
    tags: ["ai", "ocr", "extraction", "parsing", "eob"],
  },
  {
    id: "policy",
    icon: "policy",
    title: "Policy Intelligence",
    desc: "Cross-references denial codes against payer medical policies to find the clinical evidence that supports reversal.",
    tags: ["policy", "evidence", "research", "compliance", "database"],
  },
  {
    id: "writer",
    icon: "writer",
    title: "Appeal Letter Engine",
    desc: "Generates professionally formatted, clinically accurate appeal letters tailored to the specific denial reason.",
    tags: ["writing", "letter", "draft", "appeal", "generation"],
  },
  {
    id: "compliance",
    icon: "compliance",
    title: "Compliance Guard",
    desc: "Every generated letter is checked against current regulatory requirements before it reaches staff review.",
    tags: ["compliance", "regulatory", "hipaa", "security", "validation"],
  },
  {
    id: "tracking",
    icon: "tracking",
    title: "Case Dashboard",
    desc: "Track every appeal from intake to resolution. See denial patterns, win rates, and revenue recovered at a glance.",
    tags: ["dashboard", "tracking", "analytics", "reporting", "metrics"],
  },
  {
    id: "review",
    icon: "review",
    title: "Staff Review Gate",
    desc: "Nothing leaves without human sign-off. Your billing team reviews, edits, and approves every letter before it sends.",
    tags: ["review", "human", "approval", "control", "safety"],
  },
];

/* ── Search icon SVG ── */
function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-ink-500">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5,13.5 L17,17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function FeatureGrid() {
  const [query, setQuery] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const normalised = query.toLowerCase().trim();
  const filtered = features.filter(
    (f) =>
      !normalised ||
      f.title.toLowerCase().includes(normalised) ||
      f.desc.toLowerCase().includes(normalised) ||
      f.tags.some((t) => t.includes(normalised))
  );
  const filteredIds = new Set(filtered.map((f) => f.id));

  useEffect(() => {
    const search = searchRef.current;
    const section = sectionRef.current;
    if (!search || !section) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top 90%",
        end: "top 30%",
        scrub: 0.3,
        onUpdate: (self) => {
          const p = self.progress;
          const blur = 4 + p * 12;
          const border = 0.15 + p * 0.4;
          const py = 12 + p * 4;
          search.style.backdropFilter = `blur(${blur}px)`;
          search.style.webkitBackdropFilter = `blur(${blur}px)`;
          search.style.borderColor = `rgba(164,178,189,${border})`;
          search.style.paddingTop = `${py}px`;
          search.style.paddingBottom = `${py}px`;
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative bg-parchment py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* Section header */}
        <div className="animate-entrance stagger-0 text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Capabilities
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink-950 lg:text-4xl">
            Everything your appeals desk needs
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            Six specialised modules working together so your team can focus on
            patient care, not paperwork.
          </p>
        </div>

        {/* Morphing search bar */}
        <div
          ref={searchRef}
          className="sticky top-4 z-10 mx-auto mt-10 flex max-w-md items-center gap-3 rounded-lg border border-ink-300/15 bg-white/70 px-4 py-3 shadow-sm transition-shadow focus-within:shadow-md"
          style={{
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          <SearchIcon />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features..."
            className="w-full bg-transparent text-sm text-ink-950 placeholder:text-ink-300 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-ink-500 hover:text-ink-700"
            >
              Clear
            </button>
          )}
        </div>

        {/* Feature card grid */}
        <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const visible = filteredIds.has(f.id);
            return (
              <div
                key={f.id}
                className={`card-enter rounded-lg border border-ink-300/30 bg-white p-6 ${
                  visible ? "opacity-100" : "card-hidden"
                }`}
              >
                <div className="mb-4">{icons[f.icon]}</div>
                <h3 className="font-display text-lg font-semibold text-ink-950">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="mt-8 text-center text-sm text-ink-500">
            No features match &ldquo;{query}&rdquo; — try &ldquo;ai&rdquo;,
            &ldquo;compliance&rdquo;, or &ldquo;dashboard&rdquo;.
          </p>
        )}
      </div>
    </section>
  );
}
