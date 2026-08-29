/* ============================================================
   Landing graph — force simulation (pure state + physics)
   ------------------------------------------------------------
   No DOM, no canvas, no timers: callers own the loop and call
   step(). O(n²) repulsion is fine — n is tiny by design.

   createSimulation({ projects, edges, width, height, labels })
     .step(noWobble)      advance one tick
     .setSize(w, h)       viewport changed
     .setBounds(top, bottom)  the free vertical band (below the intro,
                          above the dock), measured by the caller
     .setIntro(on)        intro overlay up -> nodes keep below the band top
     .nodeAt(x, y)        hit-test (22px radius)
     .neighbours(id)      Set of ids linked to id

   Nodes without any edge (nothing in the corpus is unusually similar
   to them — see be_src retrieval/edges.py) float: repulsion alone would
   push them to the viewport margin, so they get FLOAT_GRAVITY× the
   centre pull and settle in the gaps between clusters instead.

   Shape, after Obsidian's graph view: a soft circular boundary (RADIUS ×
   the short viewport side, fitted to the measured free band) keeps the
   cloud round instead of rectangular, low damping makes motion slow, and
   a speed cap keeps every return calm. Dots are all one size: link count
   is textual similarity, not importance, and size would read as importance.

   Tuning: PHYSICS has four knobs (SPACING, FIT, MAX_SPEED, WOBBLE); the
   rest is fixed or derived, so the knobs don't fight each other.
   ============================================================ */

export const PHYSICS = {
  // The four knobs. Everything else is fixed or derived from these and
  // from the band the graph lives in, so one change does not ripple.
  SPACING: 1.0, // linked neighbours' rest length, × the room's radius — the cloud fills a phone and a desktop band alike
  FIT: 1.0, // repulsion sized so the unlinked spread is FIT× the room; the linked cluster's size is SPACING's job
  MAX_SPEED: 3, // px/frame: a released node glides home at this speed however far it was dragged
  WOBBLE: 10, // px amplitude of the idle sway

  // fixed
  CENTER: 0.0012, // centre pull; sets the time scale of everything slow
  DAMP: 0.86, // friction per frame
  SPRING: 0.006, // link stiffness — the critical-damping value for DAMP: (1 − √DAMP)² / DAMP; higher bounces
  FLOAT_GRAVITY: 3, // centre pull multiplier for nodes with no edges
  RADIUS: 0.34, // soft circular boundary, × min(W, H)
};

const NODE_R = 4.5;
const HIT_R = 22;
const EDGE_MARGIN = 56;
const DOCK_MARGIN = 128; // fallback when the dock hasn't been measured
const LABEL_PAD = 18; // room above a node for its label inside the band
const CLEAR_LABELS = 90; // min centre distance so two 11px labels don't collide
const CLEAR_DOTS = 48; // …when labels are off (compact)
const FIELD_EASE = 0.05; // how fast the force field re-centres on the cloud's extent
const OVERSHOOT = 40; // how far the boundary circle pokes past the band, top and bottom

export function createSimulation({
  projects,
  edges,
  width,
  height,
  labels = true,
}) {
  const padTop = labels ? LABEL_PAD : NODE_R; // compact mode draws no labels
  const clear = labels ? CLEAR_LABELS : CLEAR_DOTS;
  let W = width;
  let H = height;
  let t = 0;
  let introActive = true;
  let bandTop = null; // measured free band; null → the old fractions
  let bandBottom = null;
  let fieldX = width / 2; // where gravity and the circle pull to (see step)
  let fieldY = height / 2;

  function band() {
    const bottom = bandBottom ?? H - DOCK_MARGIN;
    const top = introActive ? (bandTop ?? H * 0.53) : EDGE_MARGIN;
    return { top: Math.min(top, bottom - 2 * HIT_R), bottom };
  }

  /* seed nodes on a ring around centre with a little jitter */
  const cx0 = W / 2;
  const cy0 = H / 2;
  const nodes = projects.map((p, i) => {
    const a = (i / projects.length) * Math.PI * 2;
    const rad = Math.min(W, H) * 0.22;
    return {
      id: p.id,
      label: p.title,
      lean: p.lean,
      x: cx0 + Math.cos(a) * rad + (Math.random() - 0.5) * 24,
      y: cy0 + Math.sin(a) * rad + (Math.random() - 0.5) * 24,
      vx: 0,
      vy: 0,
      r: NODE_R,
      pinned: false,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = edges.map((e) => ({ a: e.a, b: e.b, w: e.w }));
  const linked = new Set(links.flatMap((l) => [l.a, l.b]));
  for (const n of nodes) n.floating = !linked.has(n.id);

  function neighbours(id) {
    const set = new Set();
    for (const l of links) {
      if (l.a === id) set.add(l.b);
      if (l.b === id) set.add(l.a);
    }
    return set;
  }

  function step(noWobble) {
    t += 1;

    // the band, in dot-centre terms — padded for the INK, not the dots:
    // a label hangs above its dot only, so the top loses a label's height
    // and the bottom just a dot's radius (both pads equal, the gap under
    // the graph read twice the one above)
    const { top, bottom } = band();
    const lo = top + padTop;
    const hi = bottom - NODE_R;
    const bx = W / 2;
    const by = (lo + hi) / 2;
    // the boundary circle: taller than the band, so the band's floor and
    // ceiling — not the circle — are what the cloud rests on, top and
    // bottom alike; the circle rounds the sides and is what a far-dragged
    // node comes back through
    const R = Math.min(
      Math.min(W, H) * PHYSICS.RADIUS,
      (hi - lo) / 2 + OVERSHOOT,
      W / 2 - EDGE_MARGIN,
    );
    // repulsion derived from the room there is: n charges q under a centre
    // pull g settle at radius ≈ (q·n/g)^(1/3), so q = g·(FIT·room)³/n makes
    // the cloud FIT× the room (the band's half-height, or the circle when
    // that is smaller). A fixed q either over-pressurised the cloud against
    // the walls — every release then snapped — or left it tiny.
    const room = Math.min(R, (hi - lo) / 2);
    const q =
      (PHYSICS.CENTER * (PHYSICS.FIT * room) ** 3) / Math.max(1, nodes.length);

    // pairwise repulsion
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2);
        // long range: 1/d² spread; short range: a soft collision at `clear`,
        // so labels keep apart without the whole cloud inflating
        const f = q / d2 + (d < clear ? (clear - d) * PHYSICS.SPRING : 0);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // similarity springs — more similar sits closer
    for (const l of links) {
      const a = byId.get(l.a);
      const b = byId.get(l.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = PHYSICS.SPACING * room * (1.25 - l.w);
      const f = PHYSICS.SPRING * (d - rest);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // soft floor and ceiling (the hard clamp below is the last resort)
    for (const n of nodes) {
      if (n.y < lo) n.vy += (lo - n.y) * 0.02;
      else if (n.y > hi) n.vy -= (n.y - hi) * 0.02;
    }

    // gravity and the circle settle the cloud's CENTROID on their centre;
    // an uneven cluster's centroid is not the middle of its extent, so the
    // centre is offset by (centroid − extent middle): at rest the extent,
    // i.e. what the eye sees, is centred on the band. Every node gets the
    // same offset, so nothing changes between nodes — a dragged node still
    // comes back through the springs and the soft circle alone.
    let sx = 0;
    let sy = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let free = 0;
    for (const n of nodes) {
      if (n.pinned) continue;
      sx += n.x;
      sy += n.y;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
      free += 1;
    }
    if (free) {
      fieldX += (bx + sx / free - (minX + maxX) / 2 - fieldX) * FIELD_EASE;
      fieldY += (by + sy / free - (minY + maxY) / 2 - fieldY) * FIELD_EASE;
    }
    const cx = fieldX;
    const cy = fieldY;

    // floating nodes get extra pull toward the centre — with the reaction
    // spread over the linked nodes: a one-sided pull is a net force on the
    // whole cloud, which drifted it against the intro
    let rxSum = 0;
    let rySum = 0;
    let linkedFree = 0;
    for (const n of nodes) {
      if (n.pinned) continue;
      if (!n.floating) {
        linkedFree += 1;
        continue;
      }
      const fx = (cx - n.x) * PHYSICS.CENTER * (PHYSICS.FLOAT_GRAVITY - 1);
      const fy = (cy - n.y) * PHYSICS.CENTER * (PHYSICS.FLOAT_GRAVITY - 1);
      n.vx += fx;
      n.vy += fy;
      rxSum -= fx;
      rySum -= fy;
    }

    const drift = PHYSICS.WOBBLE * PHYSICS.CENTER; // a steady push of g·A displaces by A
    for (const n of nodes) {
      n.vx += (cx - n.x) * PHYSICS.CENTER;
      n.vy += (cy - n.y) * PHYSICS.CENTER;
      if (!n.floating && !n.pinned && linkedFree) {
        n.vx += rxSum / linkedFree;
        n.vy += rySum / linkedFree;
      }
      const rx = n.x - cx;
      const ry = n.y - cy;
      const rd = Math.sqrt(rx * rx + ry * ry) || 0.01;
      if (rd > R) {
        // outside the circle: the same stiffness as a link, one kind of pull-back
        const pull = (rd - R) * PHYSICS.SPRING;
        n.vx -= (rx / rd) * pull;
        n.vy -= (ry / rd) * pull;
      }
      if (!noWobble) {
        n.vx += Math.sin(t * 0.006 + n.x * 0.01) * drift;
        n.vy += Math.cos(t * 0.006 + n.y * 0.01) * drift;
      }
      n.vx *= PHYSICS.DAMP;
      n.vy *= PHYSICS.DAMP;
      // speed cap: forces decide the direction and the last easing-in,
      // MAX_SPEED decides how calm the trip is
      const v = Math.hypot(n.vx, n.vy);
      if (v > PHYSICS.MAX_SPEED) {
        n.vx *= PHYSICS.MAX_SPEED / v;
        n.vy *= PHYSICS.MAX_SPEED / v;
      }
      if (n.pinned) continue;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(EDGE_MARGIN, Math.min(W - EDGE_MARGIN, n.x));
      n.y = Math.max(lo, Math.min(hi, n.y));
    }
  }

  function nodeAt(mx, my) {
    let best = null;
    let bestD = HIT_R * HIT_R;
    for (const n of nodes) {
      const dx = n.x - mx;
      const dy = n.y - my;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  return {
    step,
    nodeAt,
    neighbours,
    setSize(w, h) {
      W = w;
      H = h;
    },
    setBounds(top, bottom) {
      bandTop = top;
      bandBottom = bottom;
    },
    setIntro(on) {
      introActive = !!on;
    },
    get nodes() {
      return nodes;
    },
    get links() {
      return links;
    },
    node(id) {
      return byId.get(id) ?? null;
    },
  };
}
