"""Build the SVD image-compression demo artifacts (and the post's cover).

    be_src/.venv/bin/python fe_src/scripts/build_svd_demo.py

The demo never runs an SVD in the browser: this script factorises one
photograph offline and saves the first K components; the page reconstructs
rank-k images from them with a plain matrix product.

Writes to fe_src/public/demos/svd-compression/
    original.jpg   the photo at demo size (W x H)
    u.i16          3 channels x H x K int16, U columns scaled by 32767
    vt.i16         3 channels x K x W int16, V^T rows scaled by 32767
    meta.json      w, h, k, per-channel singular values (all of them, for the
                   spectrum), cumulative energy, storage counts
and the cover to fe_src/public/images/projects/svd-compression/cover.png.

Deterministic (numpy.linalg.svd, no randomness) — the outputs are committed.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]  # fe_src/
SRC = ROOT / "public/images/projects/svd-compression/manhattan.jpg"  # 2048x1536, 4:3
OUT = ROOT / "public/demos/svd-compression"
COVER = ROOT / "public/images/projects/svd-compression/cover.png"

W, H = 384, 288       # demo size (4:3, the photo's own ratio), H rows x W cols per channel
K = 128               # components shipped to the browser (rank slider max)
SCALE = 32767


def load_fit(path: Path, w: int, h: int) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    iw, ih = img.size
    # centre-crop to w:h, then resize
    target = w / h
    if iw / ih > target:
        nw = int(round(ih * target)); left = (iw - nw) // 2
        img = img.crop((left, 0, left + nw, ih))
    else:
        nh = int(round(iw / target)); top = (ih - nh) // 2
        img = img.crop((0, top, iw, top + nh))
    return np.asarray(img.resize((w, h), Image.LANCZOS), dtype=np.float64)


def svd_channels(a: np.ndarray):
    """a: H x W x 3 → per-channel (U, s, Vt) with full_matrices=False."""
    out = []
    for c in range(3):
        u, s, vt = np.linalg.svd(a[:, :, c], full_matrices=False)
        out.append((u, s, vt))
    return out


def reconstruct(factors, k: int) -> np.ndarray:
    chans = []
    for u, s, vt in factors:
        chans.append((u[:, :k] * s[:k]) @ vt[:k, :])
    return np.clip(np.stack(chans, axis=2), 0, 255).astype(np.uint8)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    COVER.parent.mkdir(parents=True, exist_ok=True)

    a = load_fit(SRC, W, H)
    Image.fromarray(a.astype(np.uint8)).save(OUT / "original.jpg", quality=92)
    factors = svd_channels(a)

    # --- factors for the browser (int16) ---------------------------------
    u_all = np.stack([u[:, :K] for u, _, _ in factors])        # 3 x H x K
    vt_all = np.stack([vt[:K, :] for _, _, vt in factors])     # 3 x K x W
    assert np.abs(u_all).max() <= 1.0 and np.abs(vt_all).max() <= 1.0
    (OUT / "u.i16").write_bytes(np.round(u_all * SCALE).astype("<i2").tobytes())
    (OUT / "vt.i16").write_bytes(np.round(vt_all * SCALE).astype("<i2").tobytes())

    s_all = np.stack([s for _, s, _ in factors])               # 3 x min(H,W)
    energy = np.cumsum(s_all**2, axis=1) / (s_all**2).sum(axis=1, keepdims=True)
    energy_mean = energy.mean(axis=0)                          # averaged over RGB
    meta = {
        "w": W, "h": H, "k": K, "scale": SCALE,
        "source": "manhattan.jpg (10th Avenue from the High Line, New York, October 2024)",
        "singular_values": [np.round(s, 3).tolist() for s in s_all],
        "energy": np.round(energy_mean, 5).tolist(),
        "pixels_per_channel": W * H,
        "numbers_per_rank": H + W + 1,
    }
    (OUT / "meta.json").write_text(json.dumps(meta, separators=(",", ":")))

    # --- numbers for the prose ------------------------------------------
    print(f"image {W}x{H}, {W*H} pixels per channel; rank-k costs k*(H+W+1) = k*{H+W+1}")
    print("break-even rank:", int(np.ceil(W * H / (H + W + 1))))
    for k in (1, 2, 5, 10, 20, 30, 50, 100, 128):
        rec = reconstruct(factors, k).astype(np.float64)
        rmse = np.sqrt(((rec - a) ** 2).mean())
        kept = k * (H + W + 1) / (W * H)
        print(f"k={k:4d}  energy={energy_mean[k-1]*100:6.2f}%  numbers kept={kept*100:6.1f}%  rmse={rmse:5.1f}")
    s0 = s_all[:, 0]; s1 = s_all[:, 1]
    print("sigma_1 per channel:", np.round(s0, 1).tolist(), " sigma_2:", np.round(s1, 1).tolist())
    print("sigma_1 / sigma_10 / sigma_100 (mean):",
          np.round(s_all[:, 0].mean(), 1), np.round(s_all[:, 9].mean(), 1), np.round(s_all[:, 99].mean(), 1))

    # --- cover: a 2x2 rank ladder from a sharper factorisation ------------
    cw, ch = 768, 576
    big = load_fit(SRC, cw, ch)
    bigf = svd_channels(big)
    ranks = (1, 4, 16, 64)
    gap, pad, label_h = 24, 40, 44
    plate_w = pad * 2 + cw * 2 + gap
    plate_h = pad * 2 + (ch + label_h) * 2 + gap
    cover = Image.new("RGB", (plate_w, plate_h), (255, 255, 255))
    draw = ImageDraw.Draw(cover)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 22)
    except Exception:
        font = ImageFont.load_default()
    for i, k in enumerate(ranks):
        x = pad + (i % 2) * (cw + gap)
        y = pad + (i // 2) * (ch + label_h + gap)
        cover.paste(Image.fromarray(reconstruct(bigf, k)), (x, y))
        draw.rectangle([x - 1, y - 1, x + cw, y + ch], outline=(226, 226, 226))
        draw.text((x, y + ch + 12), f"rank {k}", fill=(110, 110, 110), font=font)
    draw.rectangle([0, 0, plate_w - 1, plate_h - 1], outline=(229, 229, 229))
    cover.save(COVER, optimize=True)
    print("cover", cover.size, "->", COVER.relative_to(ROOT))
    print("artifacts:", {p.name: p.stat().st_size for p in OUT.iterdir()})


if __name__ == "__main__":
    main()
