/* ============================================================
   Landing graph — force simulation (pure state + physics)
   ------------------------------------------------------------
   No DOM, no canvas, no timers: callers own the loop and call
   step(). O(n²) repulsion is fine — n is tiny by design.

   createSimulation({ projects, edges, width, height })
     .step(noWobble)      advance one tick (query node included)
     .setSize(w, h)       viewport changed
     .setIntro(on)        intro overlay up -> nodes keep below it
     .injectQuery(text, matches) / .clearQuery()
     .nodeAt(x, y)        hit-test (22px radius)
     .neighbours(id)      Set of ids linked to id
   ============================================================ */

export const PHYSICS = {
  REPULSION: 5200,
  SPRING: 0.02,
  REST: 132,
  DAMP: 0.86,
  CENTER: 0.0016,
  DRIFT: 0.012, // gentle idle wobble
};

const NODE_R = 4.5;
const HIT_R = 22;
const EDGE_MARGIN = 56;
const DOCK_MARGIN = 128; // the dock owns the bottom band
const QUERY_MARGIN = 40;

export function createSimulation({ projects, edges, width, height }) {
  let W = width;
  let H = height;
  let t = 0;
  let introActive = true;
  let queryNode = null;

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
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
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
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // query node: strong pull toward its matches
    if (queryNode) {
      for (const tg of queryNode.targets) {
        const b = byId.get(tg.id);
        if (!b) continue;
        const dx = b.x - queryNode.x;
        const dy = b.y - queryNode.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rest = 70 + (1 - tg.s) * 150;
        const f = 0.045 * (d - rest);
        queryNode.vx += (dx / d) * f;
        queryNode.vy += (dy / d) * f;
      }
    }

    // while the intro copy is up the graph lives BELOW it, not behind it
    if (introActive) {
      const floorY = H * 0.53;
      for (const n of nodes) {
        if (n.y < floorY) n.vy += (floorY - n.y) * 0.02;
      }
    }

    // integrate
    const cx = W / 2;
    const cy = introActive ? H * 0.66 : H / 2;
    for (const n of nodes) {
      n.vx += (cx - n.x) * PHYSICS.CENTER;
      n.vy += (cy - n.y) * PHYSICS.CENTER;
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
      n.y = Math.max(EDGE_MARGIN, Math.min(H - DOCK_MARGIN, n.y));
    }
    if (queryNode) {
      queryNode.x += queryNode.vx;
      queryNode.y += queryNode.vy;
      queryNode.vx *= PHYSICS.DAMP;
      queryNode.vy *= PHYSICS.DAMP;
      queryNode.x = Math.max(QUERY_MARGIN, Math.min(W - QUERY_MARGIN, queryNode.x));
      queryNode.y = Math.max(QUERY_MARGIN, Math.min(H - QUERY_MARGIN, queryNode.y));
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

  function injectQuery(text, matches) {
    const targets = matches.slice(0, 4);
    queryNode = {
      text: text.length > 22 ? `${text.slice(0, 21)}…` : text,
      x: W / 2 + (Math.random() - 0.5) * 40,
      y: H * 0.8,
      vx: 0,
      vy: 0,
      targets,
      targetSet: new Set(targets.map((m) => m.id)),
    };
    return queryNode;
  }

  return {
    step,
    nodeAt,
    neighbours,
    injectQuery,
    clearQuery() { queryNode = null; },
    setSize(w, h) { W = w; H = h; },
    setIntro(on) { introActive = !!on; },
    get nodes() { return nodes; },
    get links() { return links; },
    get queryNode() { return queryNode; },
    node(id) { return byId.get(id) ?? null; },
  };
}
