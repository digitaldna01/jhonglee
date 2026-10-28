"""Build the SVD-features (MNIST) demo artifacts, the sweep numbers and the cover.

    be_src/.venv/bin/python fe_src/scripts/build_svd_features_demo.py [--skip-sweep]

One SVD of the 56,000 x 784 training matrix, done offline; the page projects a
few digits onto the first k axes and rebuilds them in the browser. The
accuracy / training-time sweep (a logistic regression per k) is also run here
once and stored in meta.json -- it takes several minutes, so --skip-sweep
reuses the sweep already in meta.json when only the images need rebuilding.

Writes to fe_src/public/demos/svd-features/
    vt.i16        K x 784 int16: the first K right-singular vectors (rows),
                  scaled by 32767 -- the axes every digit is measured along
    digits.u8     N x 784 uint8: the demo digits (test set, one per class)
    meta.json     k, scale, labels, singular values, energy, the sweep
                  (correct basis and the wrong one), dead pixels, rank
and the cover to fe_src/public/images/projects/svd-features/cover.png.

The SVD is computed the way it was first done: eigendecomposition of A^T A
(numpy.linalg.eigh), uncentred. Deterministic apart from the sweep's
timings; the outputs are committed.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]  # fe_src/
OUT = ROOT / "public/demos/svd-features"
COVER = ROOT / "public/images/projects/svd-features/cover.png"

K = 200                # axes shipped to the browser (slider max)
SCALE = 32767
SWEEP_KS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 784]
WRONG_MAX = 100        # the wrong-basis curve is only interesting where it falls


def load_mnist():
    from sklearn.datasets import fetch_openml
    from sklearn.model_selection import train_test_split

    m = fetch_openml("mnist_784", version=1, as_frame=False, parser="liac-arff")
    x = m.data.astype(np.float32) / 255.0
    y = m.target.astype(int)
    return train_test_split(x, y, test_size=0.2, random_state=42)


def svd_by_hand(a: np.ndarray, fix_signs: bool = True):
    """Right-singular vectors and singular values of A via eigh(A^T A).

    fix_signs makes each axis's largest entry positive so the shipped axes are
    stable run to run. The first attempt had no such step -- eigh's arbitrary
    signs are part of why its two bases disagreed -- so the wrong-basis curve
    is reproduced with fix_signs=False.
    """
    ata = a.T.astype(np.float64) @ a.astype(np.float64)
    w, v = np.linalg.eigh(ata)
    order = np.argsort(w)[::-1]
    w, v = w[order], v[:, order]
    s = np.sqrt(np.clip(w, 0, None))
    if fix_signs:
        sign = np.sign(v[np.abs(v).argmax(axis=0), np.arange(v.shape[1])])
        sign[sign == 0] = 1
        v = v * sign
    return v, s


def sweep(ztr, zte, ytr, yte, ztr_raw, zte_wrong):
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score

    def fit(a, b):
        clf = LogisticRegression(max_iter=1000, solver="saga", random_state=42, tol=1e-3)
        t = time.time()
        clf.fit(a, ytr)
        return float(accuracy_score(yte, clf.predict(b))), time.time() - t

    rows = []
    for k in SWEEP_KS:
        acc, tt = fit(ztr[:, :k], zte[:, :k])
        wrong = fit(ztr_raw[:, :k], zte_wrong[:, :k])[0] if k <= WRONG_MAX else None
        rows.append({"k": k, "acc": round(acc, 4), "time": round(tt, 2),
                     "wrong_acc": None if wrong is None else round(wrong, 4)})
        print(f"k={k:4d}  acc={acc:.4f}  time={tt:6.1f}s  wrong-basis acc={wrong}", flush=True)
    return rows


def upscale(img28: np.ndarray, f: int) -> Image.Image:
    return Image.fromarray(img28).resize((28 * f, 28 * f), Image.NEAREST)


def main() -> None:
    skip = "--skip-sweep" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    COVER.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    xtr, xte, ytr, yte = load_mnist()
    print(f"mnist loaded {xtr.shape[0]} train / {xte.shape[0]} test in {time.time()-t0:.0f}s", flush=True)

    v, s = svd_by_hand(xtr)
    rank = int((s > s[0] * 1e-6).sum())          # relative: the never-inked pixels give exact zeros
    dead = int((xtr.max(axis=0) == 0).sum())
    energy = np.cumsum(s**2) / np.sum(s**2)
    print(f"rank {rank} of 784, {dead} pixels never inked; "
          f"sigma1={s[0]:.1f} sigma10={s[9]:.1f} sigma50={s[49]:.1f} sigma100={s[99]:.1f}; "
          f"energy at k=10/50/100: {energy[9]:.3f}/{energy[49]:.3f}/{energy[99]:.3f}", flush=True)

    # --- the demo digits: first test digit of each class -------------------
    idx = [int(np.where(yte == d)[0][0]) for d in range(10)]
    digits = (xte[idx] * 255).round().astype(np.uint8)
    (OUT / "digits.u8").write_bytes(digits.tobytes())

    # --- the axes ----------------------------------------------------------
    vt = v[:, :K].T.astype(np.float64)                      # K x 784
    assert np.abs(vt).max() <= 1.0
    (OUT / "vt.i16").write_bytes(np.round(vt * SCALE).astype("<i2").tobytes())

    # --- the sweep ---------------------------------------------------------
    meta_path = OUT / "meta.json"
    # the first attempt, exactly as it was: eigh on each set separately, raw signs
    v_raw, _ = svd_by_hand(xtr, fix_signs=False)
    v_wrong, _ = svd_by_hand(xte, fix_signs=False)
    if skip and meta_path.exists():
        old = json.loads(meta_path.read_text())
        rows, raw = old["sweep"], old["raw"]
        print("sweep reused from meta.json", flush=True)
        if "--redo-wrong" in sys.argv:
            from sklearn.linear_model import LogisticRegression
            from sklearn.metrics import accuracy_score
            ztr_raw, zte_wrong = xtr @ v_raw, xte @ v_wrong
            for r in rows:
                if r["k"] > WRONG_MAX:
                    continue
                clf = LogisticRegression(max_iter=1000, solver="saga", random_state=42, tol=1e-3)
                clf.fit(ztr_raw[:, :r["k"]], ytr)
                r["wrong_acc"] = round(float(accuracy_score(yte, clf.predict(zte_wrong[:, :r["k"]]))), 4)
                print(f"k={r['k']:4d}  wrong-basis acc={r['wrong_acc']}", flush=True)
    else:
        ztr, zte = xtr @ v, xte @ v
        rows = sweep(ztr, zte, ytr, yte, xtr @ v_raw, xte @ v_wrong)
        raw = next(r for r in rows if r["k"] == 784)
        print(f"sweep done in {time.time()-t0:.0f}s", flush=True)

    meta = {
        "k": K, "scale": SCALE, "side": 28, "pixels": 784,
        "train": int(xtr.shape[0]), "test": int(xte.shape[0]),
        "labels": [int(yte[i]) for i in idx],
        "singular_values": np.round(s[:300], 2).tolist(),
        "energy": np.round(energy[:300], 5).tolist(),
        "rank": rank, "dead_pixels": dead,
        "sweep": rows, "raw": raw,
    }
    meta_path.write_text(json.dumps(meta, separators=(",", ":")))

    # --- cover: four digits x a rank ladder, nearest-neighbour upscaled ------
    ranks = (1, 5, 20, 50)
    show = [0, 3, 5, 8]                                     # rows: which of the ten digits
    f, gap, pad, label_h = 7, 18, 40, 40
    cell = 28 * f
    cols = len(ranks) + 1
    plate_w = pad * 2 + cell * cols + gap * (cols - 1)
    plate_h = pad * 2 + cell * len(show) + gap * (len(show) - 1) + label_h
    cover = Image.new("RGB", (plate_w, plate_h), (255, 255, 255))
    draw = ImageDraw.Draw(cover)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 22)
    except Exception:
        font = ImageFont.load_default()
    for r, di in enumerate(show):
        x = digits[di].astype(np.float64) / 255.0
        z = x @ v[:, :K]
        y0 = pad + r * (cell + gap)
        for c, k in enumerate(ranks + ("orig",)):
            img = x if k == "orig" else z[:k] @ v[:, :k].T
            img8 = np.clip(img * 255, 0, 255).round().astype(np.uint8).reshape(28, 28)
            x0 = pad + c * (cell + gap)
            cover.paste(upscale(img8, f).convert("RGB"), (x0, y0))
            if r == 0:
                pass
            if r == len(show) - 1:
                label = "784 pixels" if k == "orig" else f"rank {k}"
                draw.text((x0, y0 + cell + 10), label, fill=(110, 110, 110), font=font)
    draw.rectangle([0, 0, plate_w - 1, plate_h - 1], outline=(229, 229, 229))
    cover.save(COVER, optimize=True)
    print("cover", cover.size, "->", COVER.relative_to(ROOT))
    print("artifacts:", {p.name: p.stat().st_size for p in OUT.iterdir()})


if __name__ == "__main__":
    main()
