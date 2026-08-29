/* ============================================================
   Landing graph — canvas renderer (drawing only, no state)
   ------------------------------------------------------------
   Colours come from the CSS custom properties at read time, so
   the canvas follows the theme automatically. readPalette() is
   called on init / resize / theme change — not per frame.
   ============================================================ */

const LABEL_FONT = "500 11px 'IBM Plex Mono', ui-monospace, monospace";

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
  };
}

export function draw(ctx, sim, palette, hoverId, { width, height, compact = false }) {
  const c = palette;
  ctx.clearRect(0, 0, width, height);

  const hot = hoverId ? sim.neighbours(hoverId) : null;

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

  // nodes
  for (const n of sim.nodes) {
    const dimmed = hoverId && hoverId !== n.id && !(hot && hot.has(n.id));
    const isHover = hoverId === n.id;
    const fill = isHover ? c.nodeHot : dimmed ? c.nodeDim : c.node;

    if (isHover) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
      ctx.fillStyle = c.ring;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    // labels: always on hover, faint when idle, hidden while a hover
    // focuses attention elsewhere; on narrow screens only the hovered /
    // tapped node is labelled (eight 11px labels don't fit a phone)
    if (isHover || (!hoverId && !compact)) {
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = isHover ? c.label : dimmed ? c.labelDim : c.labelIdle;
      ctx.fillText(n.label.toLowerCase(), n.x, n.y - n.r - 8);
    }
  }
}
