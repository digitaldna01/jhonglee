import { useCallback, useEffect, useRef, useState } from "react";

// Interactive KMeans demo. Talks to the be_src backend at /api/kmeans/*
// (Vite proxies /api → :8000 in dev; nginx proxies it in prod).

const RANGE = 10; // data lives in [0, RANGE]^2 (matches the backend)
const CW = 1000;
const CH = 760;
const PAD = 36;
const PALETTE = [
  "#ff8c00", "#12406a", "#2e9e5b", "#c0392b", "#8e44ad", "#16a085",
  "#d49a00", "#2c3e50", "#e84393", "#0984e3", "#6ab04c", "#a55eea",
];

const INIT_METHODS = [
  { value: "random", label: "Random" },
  { value: "farthest_first", label: "Farthest First" },
  { value: "kmeans++", label: "KMeans++" },
  { value: "manual", label: "Manual" },
];

const toPx = (x, y) => [
  PAD + (x / RANGE) * (CW - 2 * PAD),
  CH - PAD - (y / RANGE) * (CH - 2 * PAD),
];
const toData = (px, py) => [
  ((px - PAD) / (CW - 2 * PAD)) * RANGE,
  ((CH - PAD - py) / (CH - 2 * PAD)) * RANGE,
];

export default function KMeansDemo() {
  const canvasRef = useRef(null);
  const [numPoints, setNumPoints] = useState(300);
  const [k, setK] = useState(3);
  const [init, setInit] = useState("random");
  const [points, setPoints] = useState([]);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [converged, setConverged] = useState(false);
  const [manual, setManual] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const resetRun = () => {
    setSteps([]);
    setStepIndex(-1);
    setConverged(false);
    setManual([]);
    setError(null);
  };

  const fetchDataset = useCallback(async (n) => {
    resetRun();
    try {
      const seed = Math.floor(Math.random() * 1e6);
      const res = await fetch(`/api/kmeans/dataset?n=${n}&seed=${seed}`);
      if (!res.ok) throw new Error(`dataset ${res.status}`);
      const data = await res.json();
      setPoints(data.points);
    } catch {
      setError("Can't reach the demo backend (/api). Is the server running?");
    }
  }, []);

  useEffect(() => {
    fetchDataset(300);
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

  const handleCanvasClick = (e) => {
    if (init !== "manual" || manual.length >= k || steps.length) return;
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const bx = (e.clientX - rect.left) * (c.width / rect.width);
    const by = (e.clientY - rect.top) * (c.height / rect.height);
    const [dx, dy] = toData(bx, by);
    if (dx < 0 || dx > RANGE || dy < 0 || dy > RANGE) return;
    setManual((m) => (m.length < k ? [...m, [dx, dy]] : m));
  };

  // Render the scatter whenever state changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, CW, CH);

    ctx.strokeStyle = "#e3e6ea";
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD, PAD, CW - 2 * PAD, CH - 2 * PAD);

    const cur = stepIndex >= 0 ? steps[stepIndex] : null;
    const assignments = cur ? cur.assignments : null;

    points.forEach((p, i) => {
      const [px, py] = toPx(p[0], p[1]);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = assignments
        ? PALETTE[assignments[i] % PALETTE.length]
        : "#9aa7b2";
      ctx.globalAlpha = 0.82;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    const centroids = cur ? cur.centroids : manual;
    centroids.forEach((ctr, j) => {
      const [px, py] = toPx(ctr[0], ctr[1]);
      ctx.lineCap = "round";
      ctx.strokeStyle = cur ? PALETTE[j % PALETTE.length] : "#c0392b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px - 11, py - 11);
      ctx.lineTo(px + 11, py + 11);
      ctx.moveTo(px + 11, py - 11);
      ctx.lineTo(px - 11, py + 11);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff"; // thin halo so the X reads on top of points
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [points, steps, stepIndex, manual]);

  const total = steps.length;
  let status;
  if (error) {
    status = error;
  } else if (total === 0) {
    status =
      init === "manual"
        ? `Manual: click to place ${k} centroids (${manual.length}/${k}), then Step or Run.`
        : "Pick options, then Step or Run.";
  } else {
    const atEnd = stepIndex === total - 1;
    status =
      `Step ${stepIndex + 1} / ${total}` +
      (atEnd ? (converged ? " · converged" : " · stopped (max iterations)") : "");
  }

  const btn =
    "px-3 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="not-prose my-6">
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="text-sm">
          <span className="block text-gray-500 mb-1"># points</span>
          <input
            type="number"
            min={2}
            max={2000}
            value={numPoints}
            onChange={(e) => setNumPoints(Number(e.target.value))}
            className="w-24 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">clusters (k)</span>
          <input
            type="number"
            min={1}
            max={12}
            value={k}
            onChange={(e) => {
              setK(Math.max(1, Math.min(12, Number(e.target.value) || 1)));
              resetRun();
            }}
            className="w-20 rounded-md border border-gray-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">init method</span>
          <select
            value={init}
            onChange={(e) => handleInitChange(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 bg-white"
          >
            {INIT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => fetchDataset(numPoints)}
          className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`}
        >
          New dataset
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        onClick={handleCanvasClick}
        className={`w-full max-w-[560px] rounded-lg border border-gray-200 bg-white ${
          init === "manual" && !steps.length ? "cursor-crosshair" : ""
        }`}
      />

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          onClick={handleStep}
          disabled={busy || !points.length}
          className={`${btn} border border-[#12406a] text-[#12406a] hover:bg-[#12406a] hover:text-white`}
        >
          Step
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={busy || !points.length}
          className={`${btn} bg-[#12406a] text-white hover:bg-[#0b263e]`}
        >
          Run to convergence
        </button>
        <button
          type="button"
          onClick={resetRun}
          disabled={busy}
          className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`}
        >
          Reset
        </button>
        <span className="text-sm text-gray-500 ml-1">
          {busy ? "running…" : status}
        </span>
      </div>
    </div>
  );
}
