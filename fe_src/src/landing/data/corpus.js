/* ============================================================
   Landing — bundled corpus (offline fallback)
   ------------------------------------------------------------
   Thin adapter over corpus.gen.json, which `npm run corpus`
   generates from the posts' frontmatter + prose (the same file
   feeds be_src). Only used when the backend is unreachable —
   the live graph and retrieval come from /api/chat/*.
   ============================================================ */
import corpus from './corpus.gen.json';

export const KNOWLEDGE = corpus.docs.map((d) => ({
  ...d,
  desc: d.summary,
  // retrieval surface for the on-device keyword fallback
  blurb: [d.title, d.tags.join(' '), d.summary, ...d.chunks.map((c) => c.text)]
    .join(' ')
    .slice(0, 4000),
}));

export const PROJECTS = KNOWLEDGE.filter((d) => d.node);

export const BIO = KNOWLEDGE.find((d) => d.kind === 'bio');

export const byId = (id) => KNOWLEDGE.find((d) => d.id === id) ?? null;
