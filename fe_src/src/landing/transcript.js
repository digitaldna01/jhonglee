/* A stored conversation (GET /api/chat/sessions/:sid) rendered the same
   way a live one is: alternating user / bot messages in the thread's
   shape. Pure — no fetch, no state. */

/** The person is a source the model reads, not one the thread cites. */
export const nonBio = (sources) => (sources ?? []).filter((s) => s.kind !== 'bio');

export function messagesFromTurns(turns) {
  return turns.flatMap((t, i) => [
    { id: `t${i}u`, role: 'user', text: t.question },
    {
      id: `t${i}b`,
      role: 'bot',
      text: t.answer,
      sources: nonBio(t.sources),
      streaming: false,
      foot: { retrievalMs: t.retrieval_ms, model: t.model },
    },
  ]);
}

/** What the model is given as prior context, from the same turns. */
export function historyFromTurns(turns, maxExchanges) {
  return turns
    .flatMap((t) => [
      { role: 'user', content: t.question },
      { role: 'assistant', content: t.answer },
    ])
    .slice(-maxExchanges * 2);
}
