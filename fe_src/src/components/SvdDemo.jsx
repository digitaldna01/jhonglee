import { useEffect, useMemo, useRef, useState } from "react";

// Interactive SVD image-compression demo — a rank slider over one photograph.
// Nothing is computed on a server: scripts/build_svd_demo.py factorised the
// photo offline (U, Σ, Vᵀ per colour channel, first K components as int16)
// and this component rebuilds the rank-k image in the browser with a plain
// sum of k outer products. Files live in public/demos/svd-compression/.

const BASE = "/demos/svd-compression";
const PRESETS = [1, 2, 5, 10, 20, 50, 100];
const RESIDUAL_GAIN = 4; // how much to amplify |original − rank-k| when showing it

export default function SvdDemo() {
  const [data, setData] = useState(null); // { meta, u, vt, orig }
  const [error, setError] = useState(null);
  const [k, setK] = useState(20);
  const [showResidual, setShowResidual] = useState(false);
  const [rmse, setRmse] = useState(null);
  const origRef = useRef(null);
  const reconRef = useRef(null);
  const frame = useRef(0);

  // load the factors and the original once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meta, uBuf, vtBuf] = await Promise.all([
          fetch(`${BASE}/meta.json`).then((r) => r.json()),
          fetch(`${BASE}/u.i16`).then((r) => r.arrayBuffer()),
          fetch(`${BASE}/vt.i16`).then((r) => r.arrayBuffer()),
        ]);
        const img = new Image();
        img.src = `${BASE}/original.jpg`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = meta.w;
        c.height = meta.h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const orig = ctx.getImageData(0, 0, meta.w, meta.h).data;
        if (!cancelled) setData({ meta, u: new Int16Array(uBuf), vt: new Int16Array(vtBuf), orig });
      } catch {
        if (!cancelled) setError("Couldn't load the demo data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // paint the original once it is available
  useEffect(() => {
    if (!data || !origRef.current) return;
    const { meta, orig } = data;
    origRef.current.getContext("2d").putImageData(new ImageData(orig, meta.w, meta.h), 0, 0);
  }, [data]);

  // rebuild the rank-k image whenever k or the view changes (coalesced per frame)
  useEffect(() => {
    if (!data || !reconRef.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const { meta, u, vt, orig } = data;
      const { w, h, k: K, scale, singular_values: S } = meta;
      const out = new Uint8ClampedArray(w * h * 4);
      let se = 0;
      const acc = new Float32Array(w * h);
      for (let c = 0; c < 3; c++) {
        acc.fill(0);
        const uOff = c * h * K;
        const vtOff = c * K * w;
        for (let r = 0; r < k; r++) {
          const sr = S[c][r] / (scale * scale); // undo both int16 scalings
          const vRow = vtOff + r * w;
          for (let i = 0; i < h; i++) {
            const ui = u[uOff + i * K + r] * sr;
            if (ui === 0) continue;
            const row = i * w;
            for (let j = 0; j < w; j++) acc[row + j] += ui * vt[vRow + j];
          }
        }
        for (let p = 0; p < w * h; p++) {
          const v = Math.min(255, Math.max(0, acc[p]));
          const o = orig[p * 4 + c];
          const d = o - v;
          se += d * d;
          out[p * 4 + c] = showResidual ? Math.min(255, Math.abs(d) * RESIDUAL_GAIN) : v;
        }
      }
      for (let p = 3; p < out.length; p += 4) out[p] = 255;
      reconRef.current.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
      setRmse(Math.sqrt(se / (w * h * 3)));
    });
    return () => cancelAnimationFrame(frame.current);
  }, [data, k, showResidual]);

  const stats = useMemo(() => {
    if (!data) return null;
    const { w, h, energy, numbers_per_rank } = data.meta;
    const kept = (k * numbers_per_rank) / (w * h);
    return { kept, energy: energy[k - 1], numbers: k * numbers_per_rank, pixels: w * h };
  }, [data, k]);

  // mean singular value per index (log scale), for the little spectrum
  const spectrum = useMemo(() => {
    if (!data) return null;
    const S = data.meta.singular_values;
    const n = data.meta.k;
    const mean = Array.from({ length: n }, (_, r) => (S[0][r] + S[1][r] + S[2][r]) / 3);
    const lo = Math.log10(mean[n - 1]);
    const hi = Math.log10(mean[0]);
    return mean.map((v) => (Math.log10(v) - lo) / (hi - lo));
  }, [data]);

  const K = data?.meta.k ?? 128;
  const w = data?.meta.w ?? 384;
  const h = data?.meta.h ?? 288;

  return (
    <div className="not-prose wide my-7 w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--mat)] shadow-[var(--shadow-card)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-2)]">
          svd compression · one photograph
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
          {w}×{h} · rank {k}
        </span>
      </div>

      {/* the two pictures */}
      <div className="grid grid-cols-1 gap-3 px-4 pt-4 sm:grid-cols-2">
        <figure className="m-0">
          <canvas ref={origRef} width={w} height={h} className="block w-full rounded-md" style={{ aspectRatio: `${w} / ${h}` }} />
          <figcaption className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            original · {(w * h * 3).toLocaleString()} numbers
          </figcaption>
        </figure>
        <figure className="m-0">
          <canvas ref={reconRef} width={w} height={h} className="block w-full rounded-md" style={{ aspectRatio: `${w} / ${h}` }} />
          <figcaption className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            <span>
              {showResidual ? `thrown away at rank ${k} · ×${RESIDUAL_GAIN}` : `rank ${k}`}
              {stats && !showResidual && ` · ${(stats.numbers * 3).toLocaleString()} numbers`}
            </span>
            {rmse !== null && <span className="tabular-nums">error {rmse.toFixed(1)} / 255</span>}
          </figcaption>
        </figure>
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
            aria-label="Rank"
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
              checked={showResidual}
              disabled={!data}
              onChange={(e) => setShowResidual(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            show what was thrown away
          </label>
        </div>
      </div>

      {/* spectrum + numbers */}
      <div className="border-t border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-3">
        {spectrum && (
          <svg viewBox={`0 0 ${K} 40`} preserveAspectRatio="none" className="block h-10 w-full" aria-label="Singular values, log scale">
            {spectrum.map((v, r) => (
              <rect
                key={r}
                x={r}
                y={40 - 38 * v - 1}
                width={0.8}
                height={38 * v + 1}
                fill={r < k ? "var(--accent)" : "var(--line-soft)"}
              />
            ))}
          </svg>
        )}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-[var(--fg-3)]">
          <span>singular values σ₁…σ{K}, log scale</span>
          {stats && (
            <>
              <span className="text-[var(--fg-2)]">kept {(stats.kept * 100).toFixed(1)}% of the numbers</span>
              <span className="text-[var(--fg-2)]">energy {(stats.energy * 100).toFixed(2)}%</span>
            </>
          )}
          {error && <span className="text-[#c0392b]">{error}</span>}
          {!data && !error && <span>loading…</span>}
        </div>
      </div>
    </div>
  );
}
