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
import { PROJECTS, KNOWLEDGE } from './corpus';

export const MODEL = { kind: 'keyword', label: 'keyword vectors, on-device', dims: 0 };

const words = (t) =>
  t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

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
  let dot = 0, na = 0, nb = 0;
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
/* Each project links to its top-MAX most similar peers above FLOOR. */
const FLOOR = 0.12;
const MAX = 3;

function buildEdges() {
  const edges = [];
  const seen = new Set();
  PROJECTS.forEach((a, ai) => {
    const sims = PROJECTS.map((b, bi) => ({ bi, s: ai === bi ? -1 : cosine(VECS.get(a.id), VECS.get(b.id)) }))
      .filter((e) => e.bi !== ai)
      .sort((x, y) => y.s - x.s)
      .slice(0, MAX);
    for (const e of sims) {
      if (e.s < FLOOR) continue;
      const key = ai < e.bi ? `${ai}-${e.bi}` : `${e.bi}-${ai}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: PROJECTS[ai].id, b: PROJECTS[e.bi].id, w: e.s });
    }
  });
  return edges;
}

export const EDGES = buildEdges();
