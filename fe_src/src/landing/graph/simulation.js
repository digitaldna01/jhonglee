/* ============================================================
   Landing graph — force simulation (pure state + physics)
   ------------------------------------------------------------
   No DOM, no canvas, no timers: callers own the loop and call
   step(). O(n²) repulsion is fine — n is tiny by design.

   createSimulation({ projects, edges, width, height })
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
   the short viewport side, shrunk to the measured free band) keeps the
   cloud round instead of rectangular and low damping
   makes motion slow and springy. Dots are all one size: link count is
   textual similarity, not importance, and size would read as importance.
   ============================================================ */

export const PHYSICS = {
  REPULSION: 5200,
  SPRING: 0.014, // link stiffness: how hard neighbours pull a dragged node back
  REST: 132,
  DAMP: 0.86, // friction: lower = longer, springier settling (0.88–0.9 overshot after a drag)
  CENTER: 0.0012,
  FLOAT_GRAVITY: 3, // centre pull multiplier for nodes with no edges
  RADIUS: 0.34, // soft circular boundary, × min(W, H)
  RADIAL: 0.012, // pull-back strength outside that circle (higher = snaps back after a drag)
  DRIFT: 0.012, // gentle idle wobble
};

const NODE_R = 4.5;
const HIT_R = 22;
const EDGE_MARGIN = 56;
const DOCK_MARGIN = 128; // fallback when the dock hasn't been measured
const LABEL_PAD = 18; // room above a node for its label inside the band

export function createSimulation({ projects, edges, width, height }) {
  let W = width;
  let H = height;
  let t = 0;
  let introActive = true;
  let bandTop = null; // measured free band; null → the old fractions
  let bandBottom = null;

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

    // pairwise repulsion
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2);
        const f = PHYSICS.REPULSION / d2;
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
      const rest = PHYSICS.REST * (1.25 - l.w);
      const f = PHYSICS.SPRING * (d - rest);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    const { top, bottom } = band();
    // while the intro copy is up the graph lives BELOW it, not behind it
    if (introActive) {
      const floorY = top + LABEL_PAD;
      for (const n of nodes) {
        if (n.y < floorY) n.vy += (floorY - n.y) * 0.02;
      }
    }

    // integrate: the cloud is centred in the free band and bounded by the
    // largest circle that fits it (labels included) and the viewport width
    const cx = W / 2;
    const cy = (top + bottom) / 2;
    const R = Math.min(
      Math.min(W, H) * PHYSICS.RADIUS,
      (bottom - top) / 2 - LABEL_PAD,
      W / 2 - EDGE_MARGIN,
    );
    for (const n of nodes) {
      const g = PHYSICS.CENTER * (n.floating ? PHYSICS.FLOAT_GRAVITY : 1);
      n.vx += (cx - n.x) * g;
      n.vy += (cy - n.y) * g;
      const rx = n.x - cx;
      const ry = n.y - cy;
      const rd = Math.sqrt(rx * rx + ry * ry) || 0.01;
      if (rd > R) {
        const pull = (rd - R) * PHYSICS.RADIAL;
        n.vx -= (rx / rd) * pull;
        n.vy -= (ry / rd) * pull;
      }
      if (!noWobble) {
        n.vx += Math.sin(t * 0.006 + n.x * 0.01) * PHYSICS.DRIFT;
        n.vy += Math.cos(t * 0.006 + n.y * 0.01) * PHYSICS.DRIFT;
      }
      n.vx *= PHYSICS.DAMP;
      n.vy *= PHYSICS.DAMP;
      if (n.pinned) continue;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(EDGE_MARGIN, Math.min(W - EDGE_MARGIN, n.x));
      n.y = Math.max(top + LABEL_PAD, Math.min(bottom, n.y));
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
