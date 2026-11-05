import { useEffect, useRef, useState } from 'react';

/**
 * Sign-in / sign-up artwork: an original, code-drawn "live operations" map.
 * Trucks travel between a supplier, the central yard, a site store and two sites;
 * each destination pulses when a truck arrives, event cards slide in, and the
 * counters tick up. Everything is illustrative (sample names from the Sprint 1
 * fixture plan), not live data. With "reduce motion" on, the scene is shown still.
 */

type Kind = 'delivered' | 'dispatched' | 'received' | 'alert';
const EVENTS: { kind: Kind; title: string; detail: string }[] = [
  { kind: 'dispatched', title: 'Dispatched', detail: 'Portland cement · 240 bags → Galle Road' },
  { kind: 'received', title: 'Received', detail: 'Steel rebar 12 mm · 6 t at Central Yard' },
  { kind: 'delivered', title: 'Delivered', detail: 'River sand · 12 m³ at Matara Bridge' },
  { kind: 'alert', title: 'Low stock', detail: 'Steel rebar 12 mm at Matara Store' },
  { kind: 'delivered', title: 'Delivered', detail: 'Portland cement · 240 bags at Galle Road' },
  { kind: 'dispatched', title: 'Transfer out', detail: 'Steel rebar · 3 t → Matara Store' },
  { kind: 'delivered', title: 'Delivered', detail: 'Standard brick · 2,000 at Matara Bridge' },
];

// Route geometry (shared by the drawn road, the moving trucks and the timing).
// `begin` is used as a negative offset so every truck is already on its road at first paint.
const ROUTES = [
  { id: 'r-sup', d: 'M520 104 C 460 88 380 116 304 150', dur: 10, begin: 0 },
  { id: 'r-gal', d: 'M304 150 C 262 246 168 300 150 418', dur: 9, begin: 1.2 },
  { id: 'r-sto', d: 'M304 150 C 384 196 500 236 522 326', dur: 8, begin: 2.6 },
  { id: 'r-mat', d: 'M522 326 C 534 378 506 420 468 452', dur: 6, begin: 0.6 },
] as const;
const SPLINES = '0.45 0 0.25 1;0 0 1 1;0.45 0 0.25 1;0 0 1 1';

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function OperationsScene() {
  const svg = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState(2);
  const [deliveries, setDeliveries] = useState(12);

  useEffect(() => {
    if (prefersReducedMotion()) {
      // Freeze the trucks part-way along their routes so the still image reads well.
      try { svg.current?.setCurrentTime(3.4); svg.current?.pauseAnimations(); } catch { /* not supported */ }
      return;
    }
    const timer = window.setInterval(() => setStep((s) => s + 1), 3200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (EVENTS[step % EVENTS.length].kind === 'delivered') setDeliveries((n) => n + 1); }, [step]);

  const cards = [step - 2, step - 1, step].map((n) => ({ n, ...EVENTS[n % EVENTS.length] }));

  return <div className="ops-visual-inner">
    <div className="ops-stats" aria-hidden="true">
      <span className="ops-live"><i/>Live</span>
      <span className="ops-stat"><strong className="num">{deliveries}</strong> deliveries today</span>
      <span className="ops-stat"><strong className="num">3</strong> trucks on the road</span>
      <span className="ops-stat"><strong className="num">96%</strong> on time</span>
    </div>

    <svg ref={svg} className="ops-map" viewBox="0 0 640 540" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Animated map: trucks carry materials from a supplier and the central yard to construction sites">
      <defs>
        <pattern id="ops-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" className="ops-dot"/></pattern>
        <linearGradient id="ops-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c5f8a" stopOpacity="0.28"/><stop offset="1" stopColor="#2c5f8a" stopOpacity="0.04"/></linearGradient>
        <radialGradient id="ops-glow"><stop offset="0" stopColor="#f2b705" stopOpacity="0.35"/><stop offset="1" stopColor="#f2b705" stopOpacity="0"/></radialGradient>
        {/* top-down truck, pointing along +x so rotate="auto" follows the road */}
        <g id="ops-truck" transform="scale(1.25)">
          <rect x="-13" y="-6.5" width="18" height="13" rx="2" className="ops-trailer"/>
          <rect x="6" y="-5.5" width="8" height="11" rx="2.5" className="ops-cab"/>
          <rect x="11" y="-4" width="2" height="8" rx="1" className="ops-windscreen"/>
        </g>
        {ROUTES.map((r) => <path key={r.id} id={r.id} d={r.d}/>)}
        {/* soft fade at the edges so the map has no hard borders */}
        <radialGradient id="ops-fade-grad" cx="50%" cy="48%" r="62%"><stop offset="0.62" stopColor="#fff"/><stop offset="1" stopColor="#000"/></radialGradient>
        <mask id="ops-fade"><rect x="-40" y="-40" width="720" height="620" fill="url(#ops-fade-grad)"/></mask>
      </defs>
      <g mask="url(#ops-fade)">

      <rect width="640" height="540" fill="url(#ops-dots)"/>
      {/* coastline + sea */}
      <path className="ops-sea" d="M0 360 C 70 372 112 452 214 486 S 420 506 640 498 L 640 540 L 0 540 Z" fill="url(#ops-sea)"/>
      <path className="ops-coast" d="M0 360 C 70 372 112 452 214 486 S 420 506 640 498"/>
      <path className="ops-wave" d="M40 470 q 12 -6 24 0 t 24 0 M300 522 q 12 -6 24 0 t 24 0 M520 516 q 12 -6 24 0 t 24 0"/>
      </g>

      {/* roads: a solid bed with flowing dashes on top */}
      {ROUTES.map((r) => <g key={r.id}><path className="ops-road" d={r.d}/><path className="ops-flow" d={r.d} style={{ animationDuration: `${r.dur / 2}s` }}/></g>)}

      {/* destination pulses, timed to each truck's arrival (42% of its trip) */}
      {([['r-sup', 304, 150], ['r-gal', 150, 418], ['r-sto', 522, 326], ['r-mat', 468, 452]] as const).map(([id, x, y]) => {
        const r = ROUTES.find((route) => route.id === id)!;
        return <circle key={id} className="ops-pulse" cx={x} cy={y} r="18" style={{ animationDuration: `${r.dur}s`, animationDelay: `-${r.begin}s` }}/>;
      })}

      {/* trucks */}
      {ROUTES.map((r) => <use key={r.id} href="#ops-truck" className="ops-truck">
        <animateMotion dur={`${r.dur}s`} begin={`-${r.begin}s`} repeatCount="indefinite" rotate="auto"
          keyPoints="0;1;1;0;0" keyTimes="0;0.42;0.5;0.92;1" calcMode="spline" keySplines={SPLINES}>
          <mpath href={`#${r.id}`}/>
        </animateMotion>
      </use>)}

      {/* places */}
      <g className="ops-node ops-hub" transform="translate(304 150)">
        <circle r="46" fill="url(#ops-glow)" className="ops-hub-glow"/>
        <rect x="-21" y="-21" width="42" height="42" rx="9" className="ops-hub-box"/>
        <path d="M-10 -1 0 -8 10 -1 V 10 H -10 Z M-5 10 V 3 H 5 V 10" className="ops-hub-icon"/>
        <text x="30" y="-6" className="ops-label">Central Yard</text>
        <text x="30" y="9" className="ops-code">WH-CENTRAL-01</text>
      </g>
      <Place x={520} y={104} label="Lanka Steel" code="Supplier" icon="factory" anchor="middle"/>
      <Place x={150} y={418} label="Galle Road Apartments" code="SITE-GAL-01" icon="site"/>
      <Place x={522} y={326} label="Matara Store" code="WH-MAT" icon="store" anchor="end"/>
      <Place x={468} y={452} label="Matara Bridge" code="SITE-MAT-01" icon="site" anchor="end"/>
    </svg>

    <div className="ops-bottom">
      <p className="ops-tagline">Materials, warehouses and fleet for every site, in one place.</p>
      <ol className="ops-feed" aria-hidden="true">
        {cards.map((c, i) => <li key={c.n} className={`ops-card ops-${c.kind} ${i === 2 ? 'ops-card-new' : ''}`}>
          <i className="ops-card-dot"/>
          <span className="ops-card-text"><strong>{c.title}</strong><span>{c.detail}</span></span>
          <span className="ops-card-time">{i === 2 ? 'just now' : `${(2 - i) * 3} min ago`}</span>
        </li>)}
      </ol>
    </div>
  </div>;
}

function Place({ x, y, label, code, icon, anchor = 'start' }: { x: number; y: number; label: string; code: string; icon: 'site' | 'store' | 'factory'; anchor?: 'start' | 'end' | 'middle' }) {
  // 'middle' puts the label above the marker, clear of the road.
  const tx = anchor === 'start' ? 22 : anchor === 'end' ? -22 : 0;
  const ty = anchor === 'middle' ? -40 : -3;
  return <g className="ops-node" transform={`translate(${x} ${y})`}>
    <circle r="13" className="ops-place"/>
    {icon === 'site' && <path d="M-5 5 V -3 L 0 -6 L 5 -3 V 5 M-2 5 V 1 H 2 V 5" className="ops-place-icon"/>}
    {icon === 'store' && <path d="M-6 -1 0 -5 6 -1 V 5 H -6 Z" className="ops-place-icon"/>}
    {icon === 'factory' && <path d="M-6 5 V -1 L -2 1 V -1 L 2 1 V -5 H 5 V 5 Z" className="ops-place-icon"/>}
    <text x={tx} y={ty} textAnchor={anchor} className="ops-label">{label}</text>
    <text x={tx} y={ty + 14} textAnchor={anchor} className="ops-code">{code}</text>
  </g>;
}
