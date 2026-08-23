/* ============================================================
   Landing graph — canvas renderer (drawing only, no state)
   ------------------------------------------------------------
   Colours come from the CSS custom properties at read time, so
   the canvas follows the theme automatically. readPalette() is
   called on init / resize / theme change — not per frame.
   ============================================================ */

const LABEL_FONT = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
const QUERY_FONT = "500 10.5px 'IBM Plex Mono', ui-monospace, monospace";

export function readPalette(theme) {
  const dark = theme === 'dark';
  const cs = getComputedStyle(document.documentElement);
  const hot = (cs.getPropertyValue('--accent') || '#b4342a').trim();
  const rgb = (cs.getPropertyValue('--accent-rgb') || '180,52,42').trim();
  return {
    edge: dark ? 'rgba(235,235,238,0.10)' : 'rgba(20,20,22,0.085)',
    edgeHot: `rgba(${rgb},0.55)`,
    node: dark ? 'rgba(235,235,238,0.34)' : 'rgba(20,20,22,0.30)',
    nodeDim: dark ? 'rgba(235,235,238,0.13)' : 'rgba(20,20,22,0.12)',
    nodeHot: hot,
    ring: `rgba(${rgb},0.31)`,
    label: dark ? 'rgba(235,235,238,0.82)' : 'rgba(20,20,22,0.78)',
    labelDim: dark ? 'rgba(235,235,238,0.24)' : 'rgba(20,20,22,0.22)',
    labelIdle: dark ? 'rgba(235,235,238,0.52)' : 'rgba(20,20,22,0.46)',
    query: hot,
  };
}

export function draw(ctx, sim, palette, hoverId, { width, height }) {
  const c = palette;
  ctx.clearRect(0, 0, width, height);

  const hot = hoverId ? sim.neighbours(hoverId) : null;
  const q = sim.queryNode;
  const qset = q ? q.targetSet : null;

  // edges
  for (const l of sim.links) {
    const a = sim.node(l.a);
    const b = sim.node(l.b);
    if (!a || !b) continue;
    const isHot = hoverId && (l.a === hoverId || l.b === hoverId);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isHot ? c.edgeHot : c.edge;
    ctx.lineWidth = isHot ? 1.4 : 0.6 + l.w * 1.1;
    ctx.stroke();
  }

  // query edges (dashed, weighted by similarity)
  if (q) {
    for (const tg of q.targets) {
      const b = sim.node(tg.id);
      if (!b) continue;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = c.edgeHot;
      ctx.lineWidth = 0.8 + tg.s * 2.2;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // nodes
  for (const n of sim.nodes) {
    const dimmed =
      (hoverId && hoverId !== n.id && !(hot && hot.has(n.id))) ||
      (q && qset && !qset.has(n.id));
    const matched = q && qset && qset.has(n.id);
    const isHover = hoverId === n.id;
    let fill = dimmed ? c.nodeDim : c.node;
    if (matched || isHover) fill = c.nodeHot;

    if (matched || isHover) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
      ctx.fillStyle = c.ring;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    // labels: always on hover/match, faint when idle, hidden while
    // a hover or query focuses attention elsewhere
    const showLabel = isHover || matched || (!q && !hoverId);
    if (showLabel) {
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = matched || isHover ? c.label : dimmed ? c.labelDim : c.labelIdle;
      ctx.fillText(n.label.toLowerCase(), n.x, n.y - n.r - 8);
    }
  }

  // query node on top
  if (q) {
    ctx.beginPath();
    ctx.arc(q.x, q.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = c.query;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(q.x, q.y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = c.ring;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = QUERY_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = c.query;
    ctx.fillText(`“${q.text}”`, q.x, q.y - 18);
  }
}
