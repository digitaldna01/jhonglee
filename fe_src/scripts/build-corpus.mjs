/* ============================================================
   Build the RAG corpus from the posts themselves.
   ------------------------------------------------------------
   posts/*.mdx + content/*.md (YAML frontmatter) are the single
   source of truth. This script extracts the English prose, splits
   it into section chunks, and writes:

     be_src/app/content/corpus.json            (backend: chunk + embed)
     fe_src/src/landing/data/corpus.gen.json (frontend fallback graph)

   Run with `npm run corpus` after editing posts; the outputs are
   committed so the Docker builds never need cross-context access.

   Frontmatter knobs:
     rag.include: false  -> post stays out of the corpus entirely
     rag.node: false     -> retrievable, but not a graph node (e.g. bio)
     lean / stack        -> graph + detail-panel metadata
   ============================================================ */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ROOT = path.resolve(import.meta.dirname, '..');
// posts render on the site AND feed the corpus; content/ docs are
// corpus-only (retrievable knowledge with no page of their own)
const SOURCES = [
  { dir: path.join(ROOT, 'src/posts'), hasPage: true },
  { dir: path.join(ROOT, 'src/content'), hasPage: false },
];
const OUTPUTS = [
  path.resolve(ROOT, '../be_src/app/content/corpus.json'),
  path.join(ROOT, 'src/landing/data/corpus.gen.json'),
];

const KIND = { POST: 'post', PROJECTS: 'project', BIO: 'bio' };
const MAX_CHUNK = 2200; // chars — roughly 400-500 tokens

/* keep only the English half of <Lang>-split bodies */
function englishBody(body) {
  const blocks = [...body.matchAll(/<Lang locale="en">([\s\S]*?)<\/Lang>/g)];
  return blocks.length ? blocks.map((m) => m[1]).join('\n\n') : body;
}

/* mdx -> plain prose (headings kept for section splitting) */
function toPlainText(md) {
  return md
    .replace(/^import .*$/gm, '')
    .replace(/^export .*$/gm, '')
    .replace(/```[\s\S]*?```/g, '') // fenced code is noise for retrieval
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$[^$\n]+\$/g, '')
    .replace(/<[A-Za-z][^>]*\/>/g, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* split on ## / ### headings (posts write sections as ###); oversized
   sections split again on paragraphs */
function toChunks(id, text) {
  const stripHeadings = (s) => s.replace(/^#{1,6}\s+/gm, '').trim();
  const parts = text.split(/^###?\s+/m);
  const sections = [];
  if (parts[0].trim()) sections.push({ heading: null, text: stripHeadings(parts[0]) });
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? '' : stripHeadings(part.slice(nl + 1));
    if (body) sections.push({ heading, text: body });
  }

  const chunks = [];
  for (const { heading, text: sec } of sections) {
    if (sec.length <= MAX_CHUNK) {
      chunks.push({ heading, text: sec });
      continue;
    }
    let buf = '';
    for (const para of sec.split(/\n\n+/)) {
      if (buf && buf.length + para.length > MAX_CHUNK) {
        chunks.push({ heading, text: buf.trim() });
        buf = '';
      }
      buf += `${para}\n\n`;
    }
    if (buf.trim()) chunks.push({ heading, text: buf.trim() });
  }
  return chunks.map((c, i) => ({ id: `${id}#${i}`, ...c }));
}

const docs = [];
for (const { dir, hasPage } of SOURCES) {
  for (const file of readdirSync(dir).filter((f) => /\.mdx?$/.test(f))) {
    const id = file.replace(/\.mdx?$/, '');
    const { data: fm, content } = matter(readFileSync(path.join(dir, file), 'utf8'));
    if (!fm.title || fm.rag?.include === false) continue;

    // POST/PROJECTS/BIO map to post/project/bio; anything else (NOTE,
    // FAQ, …) passes through lowercased so new doc types need no code
    const kind = KIND[fm.category] ?? String(fm.category ?? 'note').toLowerCase();
    const date = String(fm.date ?? '');
    docs.push({
      id,
      kind,
      title: fm.title,
      date,
      year: date.slice(0, 4) || null,
      lean: fm.lean ?? null,
      tags: fm.keywords ?? [],
      stack: fm.stack ?? null,
      summary: (fm.excerpt ?? '').trim(),
      thumbnail: fm.thumbnail ?? null,
      url: hasPage ? `/posts/${id}` : null,
      node: fm.rag?.node ?? hasPage,
      chunks: toChunks(id, toPlainText(englishBody(content))),
    });
  }
}

docs.sort((a, b) => (b.date > a.date ? 1 : -1));

/* one generated index document: the answer to "what have you made?" is the
   whole list, but retrieval shows the model only its top few documents —
   so the list is itself a document. Rebuilt with the corpus, it can't go
   stale; node: false keeps it off the graph, like the bio. */
const listed = docs.filter((d) => d.node);
docs.push({
  id: 'projectIndex',
  kind: 'index',
  title: 'All projects',
  date: '',
  year: null,
  lean: null,
  tags: ['all projects', 'list', 'overview', 'portfolio'],
  stack: null,
  // phrased as an index, not as "what I made": a summary that read like the
  // answer to "have you made anything with X?" outranked the project itself
  summary: `Index of project titles (for listing or counting them). The ${listed.length} projects: ${listed.map((d) => d.title).join(', ')}.`,
  thumbnail: null,
  url: null,
  node: false,
  chunks: [
    {
      id: 'projectIndex#0',
      // titles and years only — with every excerpt in here too, any query naming
      // a tool ("Blender") keyword-matched this list ahead of the project itself
      heading: 'Every project',
      text: listed.map((d) => `${d.title}${d.year ? ` (${d.year})` : ''}`).join('\n'),
    },
  ],
});

const payload = { generated: new Date().toISOString(), docs };
for (const out of OUTPUTS) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
}
console.log(
  `corpus: ${docs.length} docs, ${docs.reduce((n, d) => n + d.chunks.length, 0)} chunks -> ${OUTPUTS.map((o) => path.relative(path.resolve(ROOT, '..'), o)).join(', ')}`,
);
