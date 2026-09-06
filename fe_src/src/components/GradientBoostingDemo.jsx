import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Interactive gradient-boosting demo — a 1D regression toy, fully client-side.
// Top bed: the data and the ensemble's running prediction (sum of all trees).
// Bottom bed: what the NEXT tree is asked to learn — the residuals — and the
// step function it fits to them. Add trees one by one and watch the sum bend
// toward the data while the residuals flatten toward zero.

const VW = 1000;
const VH = 640;
const PAD = 28;
const SPLIT = 420; // main bed: PAD..SPLIT — residual bed: SPLIT+36..VH-PAD
const RGAP = 36;
const XMAX = 10;

const DATASETS = [
  { value: "wave", label: "Wave" },
  { value: "steps", label: "Steps" },
  { value: "bump", label: "Bump" },
];
const RATES = [
  { value: 0.1, label: "0.1" },
  { value: 0.3, label: "0.3" },
  { value: 1.0, label: "1.0" },
];

function makeData(kind, seed) {
  // small deterministic PRNG so "new data" reshuffles but renders are stable
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.9;
  const n = 60;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = (i + rnd() * 0.9) * (XMAX / n);
    let y;
    if (kind === "wave") {
      y = 3.2 + 2.1 * Math.sin(0.9 * x) + 0.6 * Math.sin(2.3 * x + 1);
    } else if (kind === "steps") {
      y = x < 2.5 ? 1.6 : x < 5 ? 4.6 : x < 7.5 ? 2.6 : 5.4;
    } else {
      y = 2.2 + 3.4 * Math.exp(-((x - 5.2) ** 2) / 1.1);
    }
    pts.push([x, y + gauss() * 0.38]);
  }
  return pts;
}

// Greedy CART regression tree on (x, r) — returns a predict(x) function.
function fitTree(points, residuals, depth) {
  const idx = points.map((_, i) => i).sort((a, b) => points[a][0] - points[b][0]);
  const build = (ids, d) => {
    const total = ids.reduce((s, i) => s + residuals[i], 0);
    const mean = total / ids.length;
    if (d === 0 || ids.length < 4) return { leaf: mean };
    // minimizing SSE over a split == maximizing sum²/n on both sides
    let best = null;
    let leftSum = 0;
    for (let k = 0; k < ids.length - 1; k++) {
      leftSum += residuals[ids[k]];
      const xa = points[ids[k]][0];
      const xb = points[ids[k + 1]][0];
      if (xb - xa < 1e-9) continue;
      const nl = k + 1;
      const nr = ids.length - nl;
      const gain = leftSum ** 2 / nl + (total - leftSum) ** 2 / nr;
      if (!best || gain > best.gain) best = { gain, cut: (xa + xb) / 2, k };
    }
    if (!best) return { leaf: mean };
    return {
      cut: best.cut,
      left: build(ids.slice(0, best.k + 1), d - 1),
      right: build(ids.slice(best.k + 1), d - 1),
    };
  };
  const root = build(idx, depth);
  const predictNode = (node, x) =>
    node.leaf !== undefined
      ? node.leaf
      : x <= node.cut
        ? predictNode(node.left, x)
        : predictNode(node.right, x);
  return (x) => predictNode(root, x);
}

const GRID_N = 240;
const gridXs = Array.from({ length: GRID_N }, (_, i) => (i / (GRID_N - 1)) * XMAX);

function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-[var(--hairline)] bg-[var(--panel)] p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
              active
                ? "bg-secondary text-[var(--accent-fill-fg)]"
                : "text-[var(--fg-2)] hover:bg-[var(--line-soft)] hover:text-secondary"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chevron({ dir }) {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true"
      className={dir === "right" ? "rotate-180" : ""}>
      <path d="M9 3 5 7 9 11" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stepper({ label, value, min, max, onChange, disabled }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  const tick =
    "flex h-6 w-6 items-center justify-center rounded text-[var(--fg-2)] transition-colors hover:bg-[var(--line-soft)] hover:text-secondary disabled:opacity-30";
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">{label}</span>
      <div className="inline-flex items-center rounded-md border border-[var(--hairline)] bg-[var(--panel)]">
        <button type="button" className={tick} disabled={disabled || value <= min}
          onClick={() => set(value - 1)} aria-label={`decrease ${label}`}>
          <Chevron dir="left" />
        </button>
        <span className="w-9 text-center text-sm tabular-nums text-[var(--fg-1)]">{value}</span>
        <button type="button" className={tick} disabled={disabled || value >= max}
          onClick={() => set(value + 1)} aria-label={`increase ${label}`}>
          <Chevron dir="right" />
        </button>
      </div>
    </div>
  );
}

function Sparkline({ values }) {
  if (values.length < 2) return null;
  const w = 88, h = 22, p = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i) => p + (i / (values.length - 1)) * (w - 2 * p);
  const y = (v) => p + (1 - (v - min) / span) * (h - 2 * p);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={path} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="1.5" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5"
        style={{ fill: "var(--accent)" }} />
    </svg>
  );
}

export default function GradientBoostingDemo() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [dataset, setDataset] = useState("wave");
  const [seed, setSeed] = useState(7);
  const [depth, setDepth] = useState(2);
  const [eta, setEta] = useState(0.3);
  // curves[t] = ensemble prediction on gridXs after t trees; preds = per-point
  const [state, setState] = useState(null);
  const [mix, setMix] = useState(1); // 0→1 morph between the last two curves

  const points = useMemo(() => makeData(dataset, seed), [dataset, seed]);

  const reset = useCallback(() => {
    const base = points.reduce((s, p) => s + p[1], 0) / points.length;
    setState({
      trees: 0,
      curve: gridXs.map(() => base),
      prevCurve: null,
      treeCurve: null, // last tree's η·f_t on the grid (residual bed)
      preds: points.map(() => base),
      mses: [points.reduce((s, p) => s + (p[1] - base) ** 2, 0) / points.length],
    });
    setMix(1);
  }, [points]);

  useEffect(() => { reset(); }, [reset]);

  const addTrees = (count) => {
    if (!state) return;
    let { curve, preds, mses, trees } = state;
    const startCurve = curve;
    let treeCurve = null;
    for (let c = 0; c < count; c++) {
      const residuals = points.map((p, i) => p[1] - preds[i]);
      const tree = fitTree(points, residuals, depth);
      treeCurve = gridXs.map((x) => eta * tree(x));
      curve = curve.map((v, i) => v + treeCurve[i]);
      preds = preds.map((v, i) => v + eta * tree(points[i][0]));
      mses = [...mses, points.reduce((s, p, i) => s + (p[1] - preds[i]) ** 2, 0) / points.length];
      trees += 1;
    }
    setState({ trees, curve, prevCurve: startCurve, treeCurve, preds, mses });
    // morph the ensemble curve from where it was to where it lands
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const t0 = performance.now();
    const dur = 380;
    const step = (t) => {
      const u = Math.min(1, (t - t0) / dur);
      setMix(1 - (1 - u) ** 3); // ease-out cubic
      if (u < 1) animRef.current = requestAnimationFrame(step);
    };
    setMix(0);
    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  // ---- rendering --------------------------------------------------------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !state) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, VW, VH);

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1a47d6";

    // fixed vertical ranges so beds don't rescale between rounds
    const ys = points.map((p) => p[1]);
    const yMin = Math.min(...ys) - 0.7;
    const yMax = Math.max(...ys) + 0.7;
    const rMax = Math.max(...ys.map((y) => Math.abs(y - ys.reduce((a, b) => a + b, 0) / ys.length)), 1);

    const beds = [
      { top: PAD, bot: SPLIT, min: yMin, max: yMax },
      { top: SPLIT + RGAP, bot: VH - PAD, min: -rMax, max: rMax },
    ];
    const px = (x) => PAD + (x / XMAX) * (VW - 2 * PAD);
    const py = (bed, y) => bed.bot - ((y - bed.min) / (bed.max - bed.min)) * (bed.bot - bed.top);

    for (const bed of beds) {
      ctx.fillStyle = "#fcfcfc";
      ctx.fillRect(PAD, bed.top, VW - 2 * PAD, bed.bot - bed.top);
      ctx.strokeStyle = "#eef1f4";
      ctx.lineWidth = 1;
      const cell = (SPLIT - PAD) / 5;
      for (let gx = PAD + cell; gx < VW - PAD; gx += cell) {
        ctx.beginPath(); ctx.moveTo(gx, bed.top); ctx.lineTo(gx, bed.bot); ctx.stroke();
      }
      for (let gy = bed.top + cell; gy < bed.bot; gy += cell) {
        ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(VW - PAD, gy); ctx.stroke();
      }
      ctx.strokeStyle = "#d8dde3";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(PAD, bed.top, VW - 2 * PAD, bed.bot - bed.top);
    }

    // bed labels
    ctx.fillStyle = "#8a97a5";
    ctx.font = "600 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("data · sum of trees", PAD + 10, PAD + 22);
    ctx.fillText("residuals · what the next tree learns", PAD + 10, SPLIT + RGAP + 22);

    const [main, resid] = beds;

    // the curve the eye follows: prev → current, eased by mix
    const drawn = state.prevCurve && mix < 1
      ? state.curve.map((v, i) => state.prevCurve[i] + (v - state.prevCurve[i]) * mix)
      : state.curve;

    // residual sticks + points (main bed)
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      // stick to the *drawn* curve so the gap closes as the curve morphs
      const gi = Math.round((x / XMAX) * (GRID_N - 1));
      ctx.strokeStyle = "rgba(192,57,43,0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(x), py(main, y));
      ctx.lineTo(px(x), py(main, drawn[gi]));
      ctx.stroke();
    }
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(px(x), py(main, y), 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#9aa7b2";
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ensemble prediction
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    drawn.forEach((v, i) => {
      const X = px(gridXs[i]);
      const Y = py(main, v);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.stroke();

    // residual bed: zero line, residual points, last tree's contribution
    ctx.strokeStyle = "#c9d1d9";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(PAD, py(resid, 0));
    ctx.lineTo(VW - PAD, py(resid, 0));
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      const r = y - state.preds[i];
      ctx.beginPath();
      ctx.arc(px(x), py(resid, r), 5, 0, Math.PI * 2);
      ctx.fillStyle = "#c0392b";
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (state.treeCurve) {
      ctx.strokeStyle = "#ff8c00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      state.treeCurve.forEach((v, i) => {
        const X = px(gridXs[i]);
        const Y = py(resid, v);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
    }
  }, [state, mix, points]);

  const mse = state ? state.mses[state.mses.length - 1] : null;
  const btn =
    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="not-prose my-7 w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--mat)] shadow-[var(--shadow-card)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-2)]">
          gradient boosting · 1d regression
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
          mse{" "}
          <span className={mse != null ? "font-semibold text-secondary" : ""}>
            {mse != null ? mse.toFixed(3) : "—"}
          </span>
        </span>
      </div>

      {/* controls */}
      <div className="flex flex-col gap-2.5 px-4 pb-1 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-9 text-[11px] uppercase tracking-wider text-[var(--fg-3)]">data</span>
          <Segmented options={DATASETS} value={dataset} onChange={setDataset} />
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className={`${btn} border border-[var(--hairline)] text-[var(--fg-2)] hover:border-secondary hover:text-secondary`}
          >
            ↻ new data
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-0.5">
          <Stepper label="depth" value={depth} min={1} max={3} onChange={(v) => setDepth(v)} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">η rate</span>
            <Segmented options={RATES} value={eta} onChange={setEta} />
          </div>
        </div>
      </div>

      {/* plot */}
      <div className="px-4 py-3">
        <canvas ref={canvasRef} width={VW} height={VH} className="block aspect-[25/16] w-full rounded-lg" />
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-3">
        <button
          type="button"
          onClick={() => addTrees(1)}
          className={`${btn} border border-secondary text-secondary hover:bg-secondary hover:text-[var(--accent-fill-fg)]`}
        >
          ▸ Add tree
        </button>
        <button
          type="button"
          onClick={() => addTrees(10)}
          className={`${btn} bg-secondary text-[var(--accent-fill-fg)] hover:bg-secondary-dark`}
        >
          ▸▸ Add 10
        </button>
        <button
          type="button"
          onClick={reset}
          className={`${btn} text-[var(--fg-2)] hover:bg-[var(--line-soft)] hover:text-secondary`}
        >
          Reset
        </button>
        <div className="ml-auto flex items-center gap-2.5">
          {state && state.mses.length > 1 && <Sparkline values={state.mses} />}
          <span className="font-mono text-[11px] tabular-nums text-[var(--fg-2)]">
            {state ? `${state.trees} trees` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
