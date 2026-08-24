"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ── Front face: stylised workbench UI ── */
function ProductCardFront() {
  return (
    <svg
      viewBox="0 0 640 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full rounded-xl"
    >
      {/* Window frame */}
      <rect width="640" height="420" rx="12" fill="#1a232d" />
      <rect y="0" width="640" height="36" rx="12" fill="#12181f" />
      <rect y="12" width="640" height="24" fill="#12181f" />
      <circle cx="22" cy="18" r="5" fill="#ff5f57" />
      <circle cx="40" cy="18" r="5" fill="#febc2e" />
      <circle cx="58" cy="18" r="5" fill="#28c840" />
      <text x="320" y="22" textAnchor="middle" fill="#5b6b7a" fontSize="10" fontFamily="system-ui">
        ClaimShield AI — Appeals Workbench
      </text>

      {/* Left panel – intake form */}
      <rect x="16" y="44" width="296" height="360" rx="8" fill="#ffffff" />
      <rect x="32" y="62" width="50" height="12" rx="2" fill="#12181f" />
      <rect x="32" y="88" width="90" height="7" rx="2" fill="#5b6b7a" />
      <rect x="32" y="102" width="264" height="72" rx="4" fill="#f6f3ec" stroke="#a4b2bd" strokeOpacity="0.3" />
      <rect x="44" y="116" width="180" height="5" rx="1" fill="#a4b2bd" opacity="0.4" />
      <rect x="44" y="128" width="140" height="5" rx="1" fill="#a4b2bd" opacity="0.4" />
      <rect x="44" y="140" width="200" height="5" rx="1" fill="#a4b2bd" opacity="0.4" />
      <rect x="32" y="190" width="120" height="7" rx="2" fill="#5b6b7a" />
      <rect x="32" y="204" width="264" height="72" rx="4" fill="#f6f3ec" stroke="#a4b2bd" strokeOpacity="0.3" />
      <rect x="44" y="218" width="160" height="5" rx="1" fill="#a4b2bd" opacity="0.4" />
      <rect x="44" y="230" width="220" height="5" rx="1" fill="#a4b2bd" opacity="0.4" />
      <rect x="44" y="242" width="180" height="5" rx="1" fill="#a4b2bd" opacity="0.4" />
      <rect x="32" y="300" width="264" height="36" rx="4" fill="#186047" />
      <text x="164" y="323" textAnchor="middle" fill="white" fontSize="12" fontFamily="system-ui" fontWeight="500">
        Draft the appeal
      </text>

      {/* Right panel – review output */}
      <rect x="328" y="44" width="296" height="360" rx="8" fill="#ffffff" />
      <rect x="344" y="62" width="130" height="12" rx="2" fill="#12181f" />
      <rect x="540" y="58" width="68" height="22" rx="4" fill="#fdf3ea" stroke="#c1652b" strokeOpacity="0.4" />
      <text x="574" y="73" textAnchor="middle" fill="#a1531f" fontSize="9" fontFamily="monospace" fontWeight="600">
        CO-50
      </text>
      <rect x="344" y="88" width="80" height="5" rx="1" fill="#5b6b7a" opacity="0.5" />
      <rect x="344" y="100" width="160" height="5" rx="1" fill="#2f3d4b" />
      <text x="608" y="100" textAnchor="end" fill="#12181f" fontSize="13" fontFamily="monospace" fontWeight="600">
        $2,450.00
      </text>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect
          key={i}
          x="344"
          y={128 + i * 14}
          width={240 + ((i * 37) % 24) - 12}
          height="5"
          rx="1"
          fill="#12181f"
          opacity="0.08"
        />
      ))}
      <rect x="344" y="310" width="12" height="12" rx="2" fill="white" stroke="#a4b2bd" />
      <rect x="362" y="313" width="190" height="6" rx="1" fill="#5b6b7a" opacity="0.4" />
      <rect x="344" y="340" width="264" height="36" rx="4" fill="#12181f" opacity="0.2" />
      <text x="476" y="363" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui" fontWeight="500" opacity="0.5">
        Mark approved
      </text>

      {/* Center shield badge */}
      <g transform="translate(320, 220)">
        <circle r="26" fill="#186047" opacity="0.95" />
        <path
          d="M0,-15 L10,-8 L10,5 C10,12 0,17 0,17 C0,17 -10,12 -10,5 L-10,-8 Z"
          fill="white"
          opacity="0.9"
        />
        <path
          d="M-3,2 L-1,4 L4,-2"
          stroke="#186047"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/* ── Back face: shield brand mark ── */
function ShieldFace() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-ink-700/30 bg-ink-950">
      <svg viewBox="0 0 120 140" fill="none" className="h-32 w-28">
        <path
          d="M60,8 L108,32 L108,72 C108,108 60,132 60,132 C60,132 12,108 12,72 L12,32 Z"
          fill="#186047"
        />
        <path
          d="M60,24 L96,42 L96,72 C96,100 60,120 60,120 C60,120 24,100 24,72 L24,42 Z"
          fill="#134a37"
        />
        <path
          d="M42,68 L54,80 L80,52"
          stroke="white"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-6 font-display text-lg text-white/80">
        Your appeal, backed by evidence.
      </p>
      <p className="mt-2 text-sm text-ink-500">
        ClaimShield AI
      </p>
    </div>
  );
}

/* ── Stat row for the text reveal ── */
function StatItem({
  icon,
  value,
  desc,
}: {
  icon: "speed" | "check" | "cost";
  value: string;
  desc: string;
}) {
  const paths: Record<string, string> = {
    speed:
      "M13,2 L3,14 H10 L7,22 L20,9 H13 Z",
    check:
      "M4,12 A8,8 0 1,1 20,12 A8,8 0 1,1 4,12 M8.5,12.5 L11,15 L16,9.5",
    cost:
      "M12,2 V22 M8,6 H16 M7,18 H17 M6,12 H18",
  };
  return (
    <div className="stat-item flex items-start gap-3" style={{ opacity: 0 }}>
      <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 flex-shrink-0">
        <path
          d={paths[icon]}
          stroke="#1f7a5c"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <p className="font-mono text-sm font-semibold text-ledger-500">
          {value}
        </p>
        <p className="text-sm text-ink-300">{desc}</p>
      </div>
    </div>
  );
}

/* ── Main scroll showcase section ── */
export default function ScrollShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const card = cardRef.current;
    const heading = headingRef.current;
    const stats = statsRef.current;
    if (!section || !card || !heading || !stats) return;

    const mm = gsap.matchMedia();

    mm.add("(min-width: 768px)", () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=400%",
          pin: true,
          scrub: 0.5,
          anticipatePin: 1,
        },
      });

      // Phase 1 (0→1): Zoom in
      tl.fromTo(
        card,
        { scale: 0.5, opacity: 0.2 },
        { scale: 1.4, opacity: 1, duration: 1, ease: "none" }
      );
      tl.to(orb1Ref.current, { x: "15%", y: "-10%", duration: 1, ease: "none" }, 0);
      tl.to(orb2Ref.current, { x: "-10%", y: "15%", duration: 1, ease: "none" }, 0);

      // Phase 2 (1→2): 3D Rotate
      tl.to(card, {
        rotateY: 180,
        rotateZ: -10,
        duration: 1,
        ease: "none",
      });
      tl.to(orb1Ref.current, { x: "-20%", scale: 1.3, opacity: 0.15, duration: 1, ease: "none" }, 1);

      // Phase 3 (2→3): Zoom out + slide left + text reveal
      tl.to(card, {
        scale: 0.85,
        rotateY: 360,
        rotateZ: 0,
        xPercent: -55,
        duration: 1,
        ease: "none",
      });

      tl.fromTo(
        heading,
        { opacity: 0, x: 50 },
        { opacity: 1, x: 0, duration: 0.35, ease: "none" },
        2.15
      );

      const statItems = stats.querySelectorAll(".stat-item");
      statItems.forEach((item, i) => {
        tl.fromTo(
          item,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.2, ease: "none" },
          2.35 + i * 0.12
        );
      });
    });

    // Mobile: simple fade-in, no pinning
    mm.add("(max-width: 767px)", () => {
      gsap.from(card, {
        scrollTrigger: { trigger: section, start: "top 80%" },
        scale: 0.85,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
      });
      gsap.from(heading, {
        scrollTrigger: { trigger: heading, start: "top 85%" },
        opacity: 0,
        y: 30,
        duration: 0.6,
      });
      const statItems = stats.querySelectorAll(".stat-item");
      statItems.forEach((item, i) => {
        gsap.from(item, {
          scrollTrigger: { trigger: item, start: "top 90%" },
          opacity: 0,
          y: 20,
          duration: 0.5,
          delay: i * 0.1,
        });
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen overflow-hidden bg-ink-950"
    >
      {/* Ambient gradient orbs */}
      <div
        ref={orb1Ref}
        className="pointer-events-none absolute left-[15%] top-[20%] h-[500px] w-[500px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #1f7a5c 0%, transparent 70%)",
          willChange: "transform, opacity",
        }}
      />
      <div
        ref={orb2Ref}
        className="pointer-events-none absolute bottom-[20%] right-[15%] h-[400px] w-[400px] rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, #5b6b7a 0%, transparent 70%)",
          willChange: "transform, opacity",
        }}
      />

      {/* Content */}
      <div className="relative mx-auto flex h-screen max-w-7xl items-center justify-center px-6">
        {/* 3D card with perspective */}
        <div className="perspective-1200 w-full max-w-2xl">
          <div
            ref={cardRef}
            className="preserve-3d relative aspect-[640/420] w-full"
            style={{ willChange: "transform, opacity" }}
          >
            <div className="backface-hide absolute inset-0 rounded-xl shadow-2xl shadow-black/40">
              <ProductCardFront />
            </div>
            <div className="backface-hide rotate-y-180 absolute inset-0 rounded-xl shadow-2xl shadow-black/40">
              <ShieldFace />
            </div>
          </div>
        </div>

        {/* Text reveal (right side) */}
        <div className="absolute right-6 top-1/2 hidden max-w-xs -translate-y-1/2 md:right-12 md:block lg:right-20 lg:max-w-sm">
          <h2
            ref={headingRef}
            className="font-display text-3xl font-semibold leading-tight text-white lg:text-4xl"
            style={{ opacity: 0 }}
          >
            From denial to appeal
            <br />
            in minutes.
          </h2>
          <div ref={statsRef} className="mt-8 space-y-5">
            <StatItem icon="speed" value="3× faster" desc="Appeal turnaround vs manual drafting" />
            <StatItem icon="check" value="100% reviewed" desc="Every letter approved by staff" />
            <StatItem icon="cost" value="Zero-cost start" desc="Built for independent practices" />
          </div>
        </div>

        {/* Mobile-only text (no scroll animation, shown statically) */}
        <div className="mt-10 md:hidden">
          <h2 className="font-display text-2xl font-semibold leading-tight text-white">
            From denial to appeal in minutes.
          </h2>
          <div className="mt-6 space-y-4">
            <StatItem icon="speed" value="3× faster" desc="Appeal turnaround vs manual drafting" />
            <StatItem icon="check" value="100% reviewed" desc="Every letter approved by staff" />
            <StatItem icon="cost" value="Zero-cost start" desc="Built for independent practices" />
          </div>
        </div>
      </div>
    </section>
  );
}
