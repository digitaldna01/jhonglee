/* ============================================================
   Landing graph — canvas lifecycle + interaction
   ------------------------------------------------------------
   Wires a simulation to a <canvas>: DPR-aware sizing, the rAF
   loop, pointer hover/drag/click, and mode handling —
     quiet  : (mobile) find a calm layout, then stop animating
     compact: (narrow) smaller labels, tighter node clearance
   The free band for the graph is measured from the page (`measure()`
   → {top, bottom}: the intro's bottom edge, the dock's top edge) rather
   than assumed from viewport fractions.
   Returns an API with destroy(); nothing global, so it lives
   and dies with the React component that owns it.
   ============================================================ */
import { createSimulation } from './simulation';
import { readPalette, draw } from './renderer';

export function createGraph(canvas, opts) {
  const { projects, edges, quiet = false, compact = false, measure, onHover, onSelect } = opts;
  let theme = opts.theme || 'light';

  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let palette = null;
  let running = true;
  let rafId = 0;
  let quietTimer = 0;
  let destroyed = false;

  let hoverId = null;
  let dragId = null;
  let dragDX = 0;
  let dragDY = 0;
  let downX = 0;
  let downY = 0;
  let moved = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    palette = readPalette(theme);
  }

  resize();
  const sim = createSimulation({ projects, edges, width: W, height: H, labels: true, compact });

  function remeasure() {
    const b = measure?.();
    if (b) sim.setBounds(b.top, b.bottom);
  }
  remeasure();

  function paint() {
    draw(ctx, sim, palette, hoverId, { width: W, height: H, compact });
  }

  function loop() {
    if (destroyed) return;
    if (running) {
      sim.step(false);
      paint();
    }
    rafId = requestAnimationFrame(loop);
  }

  /* boot: pre-settle + paint synchronously so the graph is never blank */
  for (let s = 0; s < 70; s++) sim.step(true);
  paint();
  rafId = requestAnimationFrame(loop);
  if (quiet) quietTimer = setTimeout(() => { running = false; paint(); }, 2600);
  // web fonts settle the intro's height a moment after first paint
  const measureTimer = setTimeout(() => { remeasure(); if (!running) paint(); }, 400);

  /* ---- pointer interaction ----------------------------------- */
  function setHover(id) {
    hoverId = id;
    if (!running) paint();
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (dragId) {
      if (Math.abs(mx - downX) + Math.abs(my - downY) > 4) moved = true;
      const n = sim.node(dragId);
      n.x = mx + dragDX;
      n.y = my + dragDY;
      n.vx = n.vy = 0;
      if (quiet) running = true;
      return;
    }
    const hit = sim.nodeAt(mx, my);
    const id = hit ? hit.id : null;
    canvas.style.cursor = hit ? 'grab' : 'default';
    if (id !== hoverId) {
      setHover(id);
      onHover?.(id);
    }
  }

  function onPointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const hit = sim.nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    dragId = hit.id;
    hit.pinned = true;
    if (compact && hit.id !== hoverId) { // touch: a tap reveals the label
      setHover(hit.id);
      onHover?.(hit.id);
    }
    moved = false;
    downX = e.clientX - rect.left;
    downY = e.clientY - rect.top;
    dragDX = hit.x - downX;
    dragDY = hit.y - downY;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  }

  function onRelease() {
    if (dragId) {
      const id = dragId;
      sim.node(id).pinned = false;
      dragId = null;
      if (!moved) onSelect?.(id); // a click, not a drag
    }
    canvas.style.cursor = 'default';
  }

  function onPointerLeave() {
    if (!dragId && hoverId) {
      setHover(null);
      onHover?.(null);
    }
  }

  function onWindowResize() {
    resize();
    sim.setSize(W, H);
    remeasure();
    if (!running) paint();
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onRelease);
  canvas.addEventListener('pointercancel', onRelease);
  canvas.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', onWindowResize);

  /* ---- public API -------------------------------------------- */
  return {
    setHover,
    focusNode(id) { setHover(id); },

    setTheme(next) {
      theme = next;
      palette = readPalette(theme);
      if (!running) paint();
    },

    setIntro(on) {
      sim.setIntro(on);
      remeasure();
      if (!running) paint();
    },

    nodeScreenPos(id) {
      const n = sim.node(id);
      if (!n) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + n.x, y: rect.top + n.y, r: n.r };
    },

    pause() { running = false; },
    resume() { if (!quiet) running = true; },

    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(quietTimer);
      clearTimeout(measureTimer);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onRelease);
      canvas.removeEventListener('pointercancel', onRelease);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onWindowResize);
    },
  };
}
