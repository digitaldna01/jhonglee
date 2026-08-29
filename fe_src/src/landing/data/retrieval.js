/* ============================================================
   Landing — retrieval layer (the "R" in RAG)
   ------------------------------------------------------------
   Owns how text becomes a vector and nearest-neighbour search.

     embed(text)         -> Promise<Float32Array>
     retrieve(qvec, k)   -> [{id, kind, title, doc, s}]  (real cosine)
     EDGES               -> similarity links between projects
     MODEL               -> label shown in the chat foot

   v1 vectors are a transparent STAND-IN: bag-of-words over a
   fixed vocabulary, L2-normalised, scored with real cosine.
   Nothing is faked — just not neural yet. Swap embed() for
   transformers.js/WebGPU or a be_src endpoint and NOTHING
   else changes; update MODEL.label when you do.
   ============================================================ */
import { PROJECTS, KNOWLEDGE } from "./corpus";

export const MODEL = {
  kind: "keyword",
  label: "keyword vectors, on-device",
  dims: 0,
};

const words = (t) =>
  t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/* ---- vocabulary (built once from the corpus blurbs) ---------- */
const VOCAB = new Map();
for (const d of KNOWLEDGE) {
  for (const w of words(d.blurb)) {
    if (!VOCAB.has(w)) VOCAB.set(w, VOCAB.size);
  }
}
MODEL.dims = VOCAB.size;

function keywordEmbed(text) {
  const v = new Float32Array(VOCAB.size);
  for (const w of words(text)) {
    const idx = VOCAB.get(w);
    if (idx !== undefined) v[idx] += 1;
  }
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

/** Async by contract so a neural/backend embedder can slot in unchanged. */
export function embed(text) {
  return Promise.resolve(keywordEmbed(text));
}

export function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/* ---- precomputed document vectors ---------------------------- */
const VECS = new Map(KNOWLEDGE.map((d) => [d.id, keywordEmbed(d.blurb)]));

/** Top-k documents by cosine similarity to a query vector. */
export function retrieve(qvec, k = 3) {
  return KNOWLEDGE.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    doc: d,
    s: cosine(qvec, VECS.get(d.id)),
  }))
    .sort((a, b) => b.s - a.s)
    .filter((x) => x.s > 0.001)
    .slice(0, k);
}

/* ---- similarity edges between projects (graph links) --------- */
/* Same rule as be_src retrieval/edges.py: link a pair only when each is
   among the other's EDGE_K nearest (a mutual kNN graph — at most EDGE_K
   links per node, edges grow with n, clusters emerge on their own) AND its
   cosine is at least EDGE_Z standard deviations above the mean of all
   pairs (a floor, so rank alone can't invent a relation). The rest float.
   Weight is a fixed function of the z-score (z=EDGE_Z → 0.15, z=3 → 0.85). */
const EDGE_K = 2;
const EDGE_Z = 0.5;

function buildEdges() {
  const n = PROJECTS.length;
  if (n < 3) return [];
  const sim = PROJECTS.map((p) =>
    PROJECTS.map((q) =>
      p === q ? -Infinity : cosine(VECS.get(p.id), VECS.get(q.id)),
    ),
  );
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push({ i, j, s: sim[i][j] });
  }
  const mean = pairs.reduce((acc, p) => acc + p.s, 0) / pairs.length;
  const sd = Math.sqrt(
    pairs.reduce((acc, p) => acc + (p.s - mean) ** 2, 0) / pairs.length,
  );
  if (sd < 1e-9) return [];
  const nearest = sim.map((row) =>
    row
      .map((s, j) => ({ s, j }))
      .sort((a, b) => b.s - a.s)
      .slice(0, EDGE_K)
      .map((x) => x.j),
  );
  const mutual = (i, j) => nearest[i].includes(j) && nearest[j].includes(i);
  const weight = (z) =>
    Math.round(
      (0.15 + 0.7 * Math.min(Math.max((z - EDGE_Z) / (3 - EDGE_Z), 0), 1)) *
        1000,
    ) / 1000;

  return pairs
    .map((p) => ({ ...p, z: (p.s - mean) / sd }))
    .filter((p) => mutual(p.i, p.j) && p.z >= EDGE_Z)
    .map((p) => ({ a: PROJECTS[p.i].id, b: PROJECTS[p.j].id, w: weight(p.z) }));
}

export const EDGES = buildEdges();
