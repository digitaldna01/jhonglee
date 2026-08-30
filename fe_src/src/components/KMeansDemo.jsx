import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Interactive KMeans demo — a small "lab instrument" embedded in the post.
// Talks to the be_src backend at /api/kmeans/* (Vite proxies /api → :8000 in dev;
// nginx proxies it in prod).

const RANGE = 10; // data domain is [0, RANGE]^2 on the backend
const VW = 1000; // landscape backing store; CSS scales it down, so it stays crisp
const VH = 600;
const PAD = 28;
const PALETTE = [
  "#12406a", "#ff8c00", "#2e9e5b", "#c0392b", "#8e44ad", "#16a085",
  "#d49a00", "#195a96", "#e84393", "#0984e3", "#6ab04c", "#a55eea",
];

const INIT_METHODS = [
  { value: "random", label: "Random" },
  { value: "farthest_first", label: "Farthest First" },
  { value: "kmeans++", label: "KMeans++" },
  { value: "manual", label: "Manual" },
];
const DATASETS = [
  { value: "blobs", label: "Blobs" },
  { value: "uneven", label: "Uneven blobs" },
  { value: "moons", label: "Two moons" },
  { value: "uniform", label: "Uniform" },
];

// Fit the data's bounding box (plus a small margin) into the plot rect with
// equal aspect + centered, so the view crops to wherever the points actually
// are — no empty bands, and circles/moons stay undistorted.
function fitView(points) {
  const plotW = VW - 2 * PAD;
  const plotH = VH - 2 * PAD;
  let minX = 0, minY = 0, maxX = RANGE, maxY = RANGE;
  if (points.length) {
    minX = minY = Infinity;
    maxX = maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const m = 0.08 * Math.max(maxX - minX, maxY - minY, 1);
  const bw = maxX - minX + 2 * m;
  const bh = maxY - minY + 2 * m;
  const scale = Math.min(plotW / bw, plotH / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    scale,
    tx: PAD + plotW / 2 - cx * scale,
    ty: PAD + plotH / 2 + cy * scale,
  };
}

const project = (v, x, y) => [v.tx + x * v.scale, v.ty - y * v.scale];
const unproject = (v, px, py) => [(px - v.tx) / v.scale, (v.ty - py) / v.scale];

// — Segmented toggle (replaces a native <select>) —
function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-[var(--hairline)] bg-[var(--panel)] p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
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

// — Chevron glyph for the steppers (an SVG centers cleanly in the box; a text
//   ‹ / › glyph sits on the baseline and reads slightly high) —
function Chevron({ dir }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={dir === "right" ? "rotate-180" : ""}
    >
      <path
        d="M9 3 5 7 9 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// — Numeric stepper ( ‹ n › ) —
function Stepper({ label, value, min, max, step = 1, onChange, disabled }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  const tick =
    "flex h-6 w-6 items-center justify-center rounded text-[var(--fg-2)] transition-colors hover:bg-[var(--line-soft)] hover:text-secondary disabled:opacity-30";
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">{label}</span>
      <div className="inline-flex items-center rounded-md border border-[var(--hairline)] bg-[var(--panel)]">
        <button
          type="button"
          className={tick}
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
          aria-label={`decrease ${label}`}
        >
          <Chevron dir="left" />
        </button>
        <span className="w-9 text-center text-sm tabular-nums text-[var(--fg-1)]">{value}</span>
        <button
          type="button"
          className={tick}
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
          aria-label={`increase ${label}`}
        >
          <Chevron dir="right" />
        </button>
      </div>
    </div>
  );
}

// — Cost (inertia) sparkline across the steps computed so far —
function Sparkline({ values, index }) {
  if (values.length < 2) return null;
  const w = 88;
  const h = 22;
  const p = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i) => p + (i / (values.length - 1)) * (w - 2 * p);
  const y = (v) => p + (1 - (v - min) / span) * (h - 2 * p);
  const path = (upto) =>
    values
      .slice(0, upto + 1)
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ");
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={path(values.length - 1)} fill="none" stroke="var(--hairline)" strokeWidth="1.5" />
      <path d={path(index)} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="1.5" />
      <circle cx={x(index)} cy={y(values[index])} r="2.5" style={{ fill: "var(--accent)" }} />
    </svg>
  );
}

export default function KMeansDemo() {
  const canvasRef = useRef(null);
  const [numPoints, setNumPoints] = useState(300);
  const [k, setK] = useState(3);
  const [init, setInit] = useState("random");
  const [dataset, setDataset] = useState("blobs");
  const [points, setPoints] = useState([]);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [converged, setConverged] = useState(false);
  const [manual, setManual] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Crop the view to wherever the points actually are (equal aspect, centered).
  const view = useMemo(() => fitView(points), [points]);

  const resetRun = () => {
    setSteps([]);
    setStepIndex(-1);
    setConverged(false);
    setManual([]);
    setError(null);
  };

  const fetchDataset = useCallback(async (n, kind) => {
    resetRun();
    try {
      const seed = Math.floor(Math.random() * 1e6);
      const res = await fetch(`/api/kmeans/dataset?n=${n}&seed=${seed}&kind=${kind}`);
      if (!res.ok) throw new Error(`dataset ${res.status}`);
      const data = await res.json();
      setPoints(data.points);
    } catch {
      setError("Can't reach the demo backend (/api). Is the server running?");
    }
  }, []);

  useEffect(() => {
    fetchDataset(300, "blobs");
  }, [fetchDataset]);

  const runKMeans = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { points, k, init };
      if (init === "manual") body.manual_centroids = manual;
      const res = await fetch("/api/kmeans/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `run ${res.status}`);
      const data = await res.json();
      setSteps(data.steps);
      setConverged(!!data.converged);
      return data.steps;
    } catch (e) {
      setError("Run failed: " + e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [points, k, init, manual]);

  const needsMorePicks = init === "manual" && manual.length < k;
  const picksWarning = `Manual mode: place ${k} centroids first (${manual.length}/${k}).`;

  const handleStep = async () => {
    if (needsMorePicks) return setError(picksWarning);
    if (steps.length === 0) {
      const s = await runKMeans();
      if (s) setStepIndex(0);
    } else {
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  };

  const handleRun = async () => {
    if (needsMorePicks) return setError(picksWarning);
    let s = steps;
    if (s.length === 0) s = await runKMeans();
    if (s) setStepIndex(s.length - 1);
  };

  const handleInitChange = (value) => {
    setInit(value);
    resetRun();
  };

  const handleDatasetChange = (value) => {
    setDataset(value);
    fetchDataset(numPoints, value);
  };

  const handleCanvasClick = (e) => {
    if (init !== "manual" || manual.length >= k || steps.length) return;
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const bx = (e.clientX - rect.left) * (c.width / rect.width);
    const by = (e.clientY - rect.top) * (c.height / rect.height);
    if (bx < PAD || bx > VW - PAD || by < PAD || by > VH - PAD) return;
    const [dx, dy] = unproject(view, bx, by);
    setManual((m) => (m.length < k ? [...m, [dx, dy]] : m));
  };

  // Render the plot whenever state changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, VW, VH);

    const plotW = VW - 2 * PAD;
    const plotH = VH - 2 * PAD;
    // recessed plot bed
    ctx.fillStyle = "#fcfcfc";
    ctx.fillRect(PAD, PAD, plotW, plotH);
    // faint graph-paper grid (fixed spacing, square cells)
    ctx.strokeStyle = "#eef1f4";
    ctx.lineWidth = 1;
    const cell = plotH / 4;
    for (let gx = PAD + cell; gx < VW - PAD; gx += cell) {
      ctx.beginPath();
      ctx.moveTo(gx, PAD);
      ctx.lineTo(gx, VH - PAD);
      ctx.stroke();
    }
    for (let gy = PAD + cell; gy < VH - PAD; gy += cell) {
      ctx.beginPath();
      ctx.moveTo(PAD, gy);
      ctx.lineTo(VW - PAD, gy);
      ctx.stroke();
    }
    // frame
    ctx.strokeStyle = "#d8dde3";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD, PAD, plotW, plotH);

    const cur = stepIndex >= 0 ? steps[stepIndex] : null;
    const assignments = cur ? cur.assignments : null;

    points.forEach((p, i) => {
      const [px, py] = project(view, p[0], p[1]);
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = assignments
        ? PALETTE[assignments[i] % PALETTE.length]
        : "#9aa7b2";
      ctx.globalAlpha = assignments ? 0.8 : 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    const centroids = cur ? cur.centroids : manual;
    // manual centroids (not yet clustered) take the site accent, read at draw time
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1a47d6";
    centroids.forEach((ctr, j) => {
      const [px, py] = project(view, ctr[0], ctr[1]);
      const color = cur ? PALETTE[j % PALETTE.length] : accent;
      const a = 14;
      // soft halo disc
      ctx.beginPath();
      ctx.arc(px, py, a + 4, 0, Math.PI * 2);
      ctx.fillStyle = color + "1f";
      ctx.fill();
      // white underlay so the mark reads on top of points
      ctx.lineCap = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(px - a, py - a);
      ctx.lineTo(px + a, py + a);
      ctx.moveTo(px + a, py - a);
      ctx.lineTo(px - a, py + a);
      ctx.stroke();
      // colored X
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px - a, py - a);
      ctx.lineTo(px + a, py + a);
      ctx.moveTo(px + a, py - a);
      ctx.lineTo(px - a, py + a);
      ctx.stroke();
    });
  }, [points, steps, stepIndex, manual, view]);

  const total = steps.length;
  const cur = stepIndex >= 0 ? steps[stepIndex] : null;
  const cost = cur ? cur.inertia : null;

  let status;
  let statusTone = "text-[var(--fg-2)]";
  if (error) {
    status = error;
    statusTone = "text-[#c0392b]";
  } else if (busy) {
    status = "running…";
  } else if (total === 0) {
    status =
      init === "manual" ? `place centroids ${manual.length}/${k}` : "idle";
  } else {
    const atEnd = stepIndex === total - 1;
    status =
      `step ${stepIndex + 1} / ${total}` +
      (atEnd ? (converged ? " · converged" : " · max-iter") : "");
  }

  const btn =
    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="not-prose my-7 w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--mat)] shadow-[var(--shadow-card)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-2)]">
          k-means · lloyd
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
          cost{" "}
          <span className={cost != null ? "font-semibold text-secondary" : ""}>
            {cost != null ? cost.toFixed(1) : "—"}
          </span>
        </span>
      </div>

      {/* controls */}
      <div className="flex flex-col gap-2.5 px-4 pb-1 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-9 text-[11px] uppercase tracking-wider text-[var(--fg-3)]">init</span>
          <Segmented options={INIT_METHODS} value={init} onChange={handleInitChange} disabled={busy} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-9 text-[11px] uppercase tracking-wider text-[var(--fg-3)]">data</span>
          <Segmented options={DATASETS} value={dataset} onChange={handleDatasetChange} disabled={busy} />
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-0.5">
          <Stepper
            label="k"
            value={k}
            min={1}
            max={12}
            onChange={(v) => {
              setK(v);
              resetRun();
            }}
            disabled={busy}
          />
          <Stepper
            label="pts"
            value={numPoints}
            min={50}
            max={2000}
            step={50}
            onChange={setNumPoints}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => fetchDataset(numPoints, dataset)}
            disabled={busy}
            className={`${btn} border border-[var(--hairline)] text-[var(--fg-2)] hover:border-secondary hover:text-secondary`}
          >
            ↻ new data
          </button>
        </div>
      </div>

      {/* plot */}
      <div className="px-4 py-3">
        <canvas
          ref={canvasRef}
          width={VW}
          height={VH}
          onClick={handleCanvasClick}
          className={`block aspect-[5/3] w-full rounded-lg ${
            init === "manual" && !steps.length ? "cursor-crosshair" : ""
          }`}
        />
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-3">
        <button
          type="button"
          onClick={handleStep}
          disabled={busy || !points.length}
          className={`${btn} border border-secondary text-secondary hover:bg-secondary hover:text-[var(--accent-fill-fg)]`}
        >
          ▸ Step
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={busy || !points.length}
          className={`${btn} bg-secondary text-[var(--accent-fill-fg)] hover:bg-secondary-dark`}
        >
          ▸▸ Run
        </button>
        <button
          type="button"
          onClick={resetRun}
          disabled={busy}
          className={`${btn} text-[var(--fg-2)] hover:bg-[var(--line-soft)] hover:text-secondary`}
        >
          Reset
        </button>
        <div className="ml-auto flex items-center gap-2.5">
          {total > 1 && stepIndex >= 0 && (
            <Sparkline values={steps.map((s) => s.inertia)} index={stepIndex} />
          )}
          <span className={`font-mono text-[11px] tabular-nums ${statusTone}`}>{status}</span>
        </div>
      </div>
    </div>
  );
}
