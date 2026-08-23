/* ============================================================
   Landing — answer generation (the "G" in RAG)
   ------------------------------------------------------------
   answer(question, retrieved, history) -> Promise<{text, label}>

   THE swap point for a real model: when be_src grows a
   /api/answer endpoint, replace the body of answer() (use
   ragPrompt/buildContext below to form the request) and update
   the returned label. The chat UI depends on nothing else here.

   Today it is a deliberate on-device stand-in: an extractive
   answer composed from the retrieved documents.
   ============================================================ */
import { BIO } from '../data/corpus';

/** How many prior turns are carried into a follow-up question. */
export const HISTORY_MAX = 8;

export function buildContext(retrieved) {
  return retrieved
    .map(({ doc }) =>
      doc.kind === 'bio'
        ? `About Jae Hong Lee: ${doc.desc}`
        : `Project — ${doc.title} (${doc.year}, ${doc.tags.join(', ')}): ${doc.desc}`,
    )
    .join('\n');
}

export function ragPrompt(question, context) {
  return (
    "You are the assistant on Jae Hong Lee's portfolio site. Answer the visitor's " +
    'question in 2–3 short sentences, in first person as Jae ("I…"). Ground your ' +
    "answer ONLY in the context below; if something isn't covered, say you're not sure and " +
    'point to what is here. Refer to any project by its exact title. Be plain and specific ' +
    '— no marketing language, no lists. This may be a follow-up in an ongoing ' +
    `conversation, so use the prior turns for context.\n\nContext:\n${context}` +
    `\n\nQuestion: ${question}\n\nAnswer:`
  );
}

function extractive(question, retrieved) {
  const projects = retrieved.filter((r) => r.doc.kind === 'project');
  const bioHit = retrieved.find((r) => r.doc.kind === 'bio');
  /* "who are you?" retrieves only the bio — answer with it, not a shrug */
  if (bioHit && (!projects.length || bioHit.s >= projects[0].s)) return BIO.desc;
  if (!projects.length) {
    return (
      "I'm not sure that's covered here — try asking about my machine-learning, " +
      'typography, or interface work.'
    );
  }
  const top = projects[0].doc;
  const also = projects.slice(1).map((r) => r.doc.title);
  return (
    `Closest in my work is ${top.title} — ${top.desc}` +
    (also.length ? ` Related: ${also.join(', ')}.` : '')
  );
}

/**
 * Generate an answer for a question given retrieved documents and
 * conversation history ([{role, content}]). History is unused by the
 * stand-in but part of the contract a real model needs.
 */
export function answer(question, retrieved /* , history */) {
  return Promise.resolve({
    text: extractive(question, retrieved),
    label: 'retrieval-only (on-device)',
  });
}
