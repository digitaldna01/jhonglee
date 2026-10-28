import { useEffect, useMemo, useState } from "react";

// SVD features on MNIST — ten digits rebuilt from their first k coordinates.
// scripts/build_svd_features_demo.py factorised the 56,000 x 784 training
// matrix offline and shipped the first K axes (rows of Vᵀ, int16) plus ten
// test digits and the accuracy / training-time sweep. Everything here is a
// couple of small matrix products in the browser. Files live in
// public/demos/svd-features/.

const BASE = "/demos/svd-features";
const PRESETS = [1, 2, 5, 10, 20, 50, 100, 200];
const AXES_SHOWN = 8;

export default function SvdFeaturesDemo() {
  const [data, setData] = useState(null); // { meta, vt, digits, z }
  const [error, setError] = useState(null);
  const [k, setK] = useState(20);
  const [showWrong, setShowWrong] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meta, vtBuf, dBuf] = await Promise.all([
          fetch(`${BASE}/meta.json`).then((r) => r.json()),
          fetch(`${BASE}/vt.i16`).then((r) => r.arrayBuffer()),
          fetch(`${BASE}/digits.u8`).then((r) => r.arrayBuffer()),
        ]);
        const vt = new Int16Array(vtBuf);
        const digits = new Uint8Array(dBuf);
        const { k: K, pixels: P, scale } = meta;
        const n = digits.length / P;
        // coordinates of every digit along every shipped axis: z = x · Vₖ
        const z = new Float32Array(n * K);
        for (let d = 0; d < n; d++) {
          for (let r = 0; r < K; r++) {
            let acc = 0;
            const vo = r * P;
            const xo = d * P;
            for (let j = 0; j < P; j++) acc += digits[xo + j] * vt[vo + j];
            z[d * K + r] = acc / (255 * scale);
          }
        }
        if (!cancelled) setData({ meta, vt, digits, z, n });
      } catch {
        if (!cancelled) setError("Couldn't load the demo data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // rank-k reconstruction of every digit (28x28 grey, 0..255)
  const recon = useMemo(() => {
    if (!data) return null;
    const { meta, vt, z, n } = data;
    const { k: K, pixels: P, scale } = meta;
    const out = new Uint8ClampedArray(n * P);
    const row = new Float32Array(P);
    for (let d = 0; d < n; d++) {
      row.fill(0);
      for (let r = 0; r < k; r++) {
        const zr = z[d * K + r] / scale;
        if (zr === 0) continue;
        const vo = r * P;
        for (let j = 0; j < P; j++) row[j] += zr * vt[vo + j];
      }
      for (let j = 0; j < P; j++) out[d * P + j] = row[j] * 255;
    }
    return out;
  }, [data, k]);

  // the first few axes as pictures (signed: grey is zero)
  const axes = useMemo(() => {
    if (!data) return null;
    const { vt } = data;
    const P = data.meta.pixels;
    const out = [];
    for (let r = 0; r < AXES_SHOWN; r++) {
      let m = 0;
      for (let j = 0; j < P; j++) m = Math.max(m, Math.abs(vt[r * P + j]));
      const px = new Uint8ClampedArray(P);
      for (let j = 0; j < P; j++) px[j] = 128 + (127 * vt[r * P + j]) / m;
      out.push(px);
    }
    return out;
  }, [data]);

  // accuracy / time at the current k, read off the sweep (log-linear between measured ranks)
  const at = useMemo(() => {
    if (!data) return null;
    const sw = data.meta.sweep;
    const pick = (key) => {
      let lo = sw[0], hi = sw[sw.length - 1];
      for (const r of sw) {
        if (r.k <= k) lo = r;
        if (r.k >= k) { hi = r; break; }
      }
      if (lo.k === hi.k || lo[key] == null || hi[key] == null) return lo[key];
      const t = (Math.log(k) - Math.log(lo.k)) / (Math.log(hi.k) - Math.log(lo.k));
      return lo[key] + t * (hi[key] - lo[key]);
    };
    return { acc: pick("acc"), time: pick("time"), wrong: k <= 100 ? pick("wrong_acc") : null };
  }, [data, k]);

  const K = data?.meta.k ?? 200;
  const side = data?.meta.side ?? 28;
  const raw = data?.meta.raw;

  return (
    <div className="not-prose wide my-7 w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--mat)] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-2)]">
          svd features · ten digits
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
          {side}×{side} · rank {k}
        </span>
      </div>

      {/* digits: originals above, rank-k below */}
      <div className="px-4 pt-4">
        <DigitRow label={`784 pixels`} pixels={data?.digits} n={data?.n ?? 10} side={side} />
        <DigitRow label={`rank ${k} · ${k} numbers`} pixels={recon} n={data?.n ?? 10} side={side} className="mt-2" />
      </div>

      {/* controls */}
      <div className="flex flex-col gap-3 px-4 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <span className="w-8 shrink-0 font-mono text-xs uppercase tracking-wider text-[var(--fg-3)]">k</span>
          <input
            type="range"
            min={1}
            max={K}
            value={k}
            disabled={!data}
            onChange={(e) => setK(Number(e.target.value))}
            aria-label="Number of axes"
            className="w-full accent-[var(--accent)]"
          />
          <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-[var(--fg-1)]">{k}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">try</span>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!data}
              onClick={() => setK(p)}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs tabular-nums transition-colors disabled:opacity-40 ${
                p === k
                  ? "border-secondary text-secondary"
                  : "border-[var(--hairline)] bg-[var(--panel)] text-[var(--fg-2)] hover:border-secondary hover:text-secondary"
              }`}
            >
              {p}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-[var(--fg-2)]">
            <input
              type="checkbox"
              checked={showWrong}
              disabled={!data}
              onChange={(e) => setShowWrong(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            my first attempt
          </label>
        </div>
      </div>

      {/* the curve */}
      <div className="border-t border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-3">
        {data && <Curve sweep={data.meta.sweep} k={k} showWrong={showWrong} />}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-[var(--fg-3)]">
          <span>test accuracy vs axes kept, log scale</span>
          {at && (
            <>
              <span className="text-[var(--fg-2)]">rank {k}: accuracy ≈ {(at.acc * 100).toFixed(1)}%</span>
              <span className="text-[var(--fg-2)]">training ≈ {fmtTime(at.time)}</span>
              {showWrong && at.wrong != null && (
                <span className="text-[#c0392b]">first attempt ≈ {(at.wrong * 100).toFixed(1)}%</span>
              )}
              {raw && <span>all 784: {(raw.acc * 100).toFixed(1)}% · {fmtTime(raw.time)}</span>}
            </>
          )}
          {error && <span className="text-[#c0392b]">{error}</span>}
          {!data && !error && <span>loading…</span>}
        </div>
      </div>

      {/* the axes */}
      {axes && (
        <div className="border-t border-[var(--hairline)] px-4 py-3">
          <div className="grid grid-cols-8 gap-1.5">
            {axes.map((px, i) => (
              <Tile key={i} pixels={px} offset={0} side={side} title={`axis ${i + 1}`} />
            ))}
          </div>
          <div className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            the first {AXES_SHOWN} axes · grey is zero, white positive, black negative
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(s) {
  if (s == null) return "–";
  if (s < 10) return `${s.toFixed(1)} s`;
  if (s < 90) return `${Math.round(s)} s`;
  return `${(s / 60).toFixed(1)} min`;
}

function DigitRow({ label, pixels, n, side, className = "" }) {
  return (
    <div className={className}>
      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: n }, (_, i) => (
          <Tile key={i} pixels={pixels} offset={i * side * side} side={side} />
        ))}
      </div>
      <div className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--fg-3)]">{label}</div>
    </div>
  );
}

// one 28x28 grey tile, drawn at native size and upscaled with no smoothing
function Tile({ pixels, offset, side, title }) {
  const ref = useCanvas(pixels, offset, side);
  return (
    <canvas
      ref={ref}
      width={side}
      height={side}
      title={title}
      className="block aspect-square w-full rounded-sm bg-black"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function useCanvas(pixels, offset, side) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    if (!el || !pixels) return;
    const n = side * side;
    const img = new ImageData(side, side);
    for (let j = 0; j < n; j++) {
      const v = pixels[offset + j];
      img.data[j * 4] = v;
      img.data[j * 4 + 1] = v;
      img.data[j * 4 + 2] = v;
      img.data[j * 4 + 3] = 255;
    }
    el.getContext("2d").putImageData(img, 0, 0);
  }, [el, pixels, offset, side]);
  return setEl;
}

function Curve({ sweep, k, showWrong }) {
  const W = 400, H = 90, padL = 6, padR = 6, padT = 6, padB = 6;
  const kmin = 1, kmax = sweep[sweep.length - 1].k;
  const x = (kk) => padL + ((Math.log(kk) - Math.log(kmin)) / (Math.log(kmax) - Math.log(kmin))) * (W - padL - padR);
  const y = (a) => padT + (1 - (a - 0.1) / 0.9) * (H - padT - padB);
  const pts = (key) => sweep.filter((r) => r[key] != null).map((r) => `${x(r.k).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  const guides = [0.5, 0.9];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-24 w-full" aria-label="Accuracy against number of axes">
      {guides.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--line-soft)" strokeWidth="0.5" />
          <text x={W - padR} y={y(g) - 2} textAnchor="end" fontSize="8" fill="var(--fg-3)" fontFamily="ui-monospace, monospace">
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      {showWrong && (
        <polyline points={pts("wrong_acc")} fill="none" stroke="#c0392b" strokeWidth="1.5" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      )}
      <polyline points={pts("acc")} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1={x(k)} x2={x(k)} y1={padT} y2={H - padB} stroke="var(--fg-2)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
