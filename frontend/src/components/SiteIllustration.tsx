/**
 * Live line drawing of a construction site (sign-in page and overview banner).
 *
 * 1. Lines trace themselves in once.
 * 2. Then three loops run (see "Site scene" in index.css):
 *    - the crane hoists the steel bundle, travels along the jib, lowers it and returns,
 *      while the bundle swings gently on its cable;
 *    - a truck reverses onto site, waits, then drives away (wheels turn while moving);
 *    - the aviation warning light at the top of the crane blinks.
 * With "reduce motion" on, the drawing is shown still.
 */
export function SiteIllustration({ className = '' }: { className?: string }) {
  // pathLength={1} lets CSS animate every line with the same dash values.
  const L = { pathLength: 1 } as const;
  return <svg className={`site-art ${className}`} viewBox="0 0 640 500" role="img" aria-label="Animated line drawing of a construction site: a tower crane moves a steel bundle while a delivery truck arrives">
    <g className="art-lines" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* ground */}
      <path {...L} d="M24 452H616" />
      <path {...L} className="faint" d="M24 462H616" strokeDasharray="2 10" />

      {/* tower crane: mast, jib, counter-jib, apex and ties */}
      <path {...L} d="M150 452V96M174 452V96" />
      <path {...L} className="faint" d="M150 452 174 420 150 388 174 356 150 324 174 292 150 260 174 228 150 196 174 164 150 132 174 100" />
      <path {...L} d="M138 452H186" />
      <path {...L} d="M78 96H560M78 110H186M186 96V110" />
      <path {...L} className="faint" d="M186 96 210 110 234 96 258 110 282 96 306 110 330 96 354 110 378 96 402 110 426 96 450 110 474 96 498 110 522 96 546 110 560 96" />
      <path {...L} d="M186 110H560" />
      <path {...L} d="M162 96V52M162 52 560 96M162 52 78 96" />
      <rect {...L} x="82" y="112" width="40" height="26" rx="2" />
      <rect {...L} x="146" y="116" width="32" height="22" rx="3" />

      {/* building frame going up */}
      <path {...L} d="M262 452V244M322 452V244M382 452V292M442 452V292M502 452V340" />
      <path {...L} d="M262 404H502M262 356H502M262 308H442M262 260H322" />
      <path {...L} className="faint" d="M322 404 382 356M382 404 442 356M442 404 502 356M262 356 322 308M322 356 382 308" />
      <path {...L} className="faint" d="M246 452V250M254 452V250M246 428H254M246 404H254M246 380H254M246 356H254M246 332H254M246 308H254M246 284H254M246 260H254" />

      {/* materials: cement bags + rebar bundle */}
      <rect {...L} x="36" y="430" width="34" height="22" rx="5" />
      <rect {...L} x="72" y="430" width="34" height="22" rx="5" />
      <rect {...L} x="54" y="408" width="34" height="22" rx="5" />
      <path {...L} d="M196 446H246M196 440H246M196 434H246" />
      <path {...L} className="faint" d="M206 452V430M236 452V430" />
    </g>

    {/* bundle that appears on the building once the crane has set it down */}
    <rect className="art-placed" x="438" y="322" width="68" height="16" rx="2" />

    {/* aviation warning light */}
    <circle className="art-beacon" cx="162" cy="50" r="4" />

    {/* crane trolley + cable + swinging load (moves as one unit along the jib) */}
    <g className="art-trolley">
      <rect className="art-trolley-body" x="384" y="110" width="28" height="10" rx="2" />
      <path className="art-cable" d="M398 120V238" />
      <g className="art-hoist">
        <g className="art-load">
          <path className="art-sling" d="M398 238 380 254M398 238 416 254" />
          <rect className="art-bundle" x="364" y="254" width="68" height="16" rx="2" />
          <path className="art-bundle-line" d="M370 262H426" />
        </g>
      </g>
    </g>

    {/* delivery truck */}
    <g className="art-truck" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M520 452V424M520 424H572V452" />
      <path d="M572 424V398H600L618 418V452" />
      <path d="M578 404H598L610 418H578Z" />
      <path className="faint" d="M526 416H566M530 410H562" />
      <g className="art-wheel"><circle cx="540" cy="452" r="11" /><circle cx="540" cy="452" r="3" /><path className="faint" d="M540 445V449M540 455V459" /></g>
      <g className="art-wheel"><circle cx="598" cy="452" r="11" /><circle cx="598" cy="452" r="3" /><path className="faint" d="M598 445V449M598 455V459" /></g>
    </g>
  </svg>;
}
