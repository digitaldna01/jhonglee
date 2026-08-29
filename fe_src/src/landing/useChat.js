/* ============================================================
   Landing — chat session state machine
   ------------------------------------------------------------
   Owns the conversation: entering/leaving chat mode, message
   list, streaming updates, and the graph side-effects (query
   node injection, intro handoff).

   Answer path: backend SSE first; if the backend is unreachable
   the on-device stand-in (data/retrieval + rag/generate) takes
   over with the same message shape — the UI never special-cases.
   ============================================================ */
import { useCallback, useRef, useState } from 'react';
import { RateLimitError, streamAnswer } from './rag/client';
import { embed, retrieve } from './data/retrieval';
import { answer as localAnswer, HISTORY_MAX } from './rag/generate';


// one server-side chat session per page load (see be_src chat/history.py)
const SESSION_ID = crypto.randomUUID();
let nextId = 1;

export default function useChat(graphRef) {
  const [inChat, setInChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const convoRef = useRef([]); // [{role, content}] — multiturn context
  const revealTimer = useRef(0);

  const patchMessage = useCallback((id, patch) => {
    setMessages((ms) =>
      ms.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)),
    );
  }, []);

  /* word-reveal for non-streaming (fallback) answers */
  const reveal = useCallback((id, text, onFinish) => {
    const words = text.split(/(\s+)/);
    let i = 0;
    clearInterval(revealTimer.current);
    revealTimer.current = setInterval(() => {
      i += 1;
      patchMessage(id, { text: words.slice(0, i).join('') });
      if (i >= words.length) {
        clearInterval(revealTimer.current);
        onFinish?.();
      }
    }, 16);
  }, [patchMessage]);

  const finishBot = useCallback((id, foot) => {
    patchMessage(id, (m) => ({ streaming: false, foot: { ...m.foot, ...foot } }));
    setBusy(false);
  }, [patchMessage]);

  const ask = useCallback(async (question) => {
    const q = (question || '').trim();
    if (!q || busy) return;

    setInChat(true);
    setBusy(true);
    graphRef.current?.setIntro(false);

    const botId = nextId + 1;
    nextId += 2;
    setMessages((ms) => [
      ...ms,
      { id: botId - 1, role: 'user', text: q },
      { id: botId, role: 'bot', sources: null, text: '', streaming: true, foot: {} },
    ]);

    const history = convoRef.current.slice(-HISTORY_MAX);
    const record = (text) => {
      convoRef.current = [
        ...convoRef.current,
        { role: 'user', content: q },
        { role: 'assistant', content: text },
      ].slice(-HISTORY_MAX * 2);
    };

    const onSources = (payload) => {
      const projects = payload.sources.filter((s) => s.kind !== 'bio');
      patchMessage(botId, {
        sources: projects,
        foot: {
          retrievalMs: payload.retrieval_ms,
          retrievalModel: payload.retrieval_model,
        },
      });
      graphRef.current?.injectQuery(q, projects.map((s) => ({ id: s.id, s: s.score })));
    };

    try {
      let answerText = '';
      const done = await streamAnswer({
        question: q,
        sessionId: SESSION_ID,
        history,
        onSources,
        onDelta: (chunk) => {
          answerText += chunk;
          patchMessage(botId, { text: answerText });
        },
      });
      record(answerText);
      finishBot(botId, { model: done.model });
    } catch (err) {
      if (err instanceof RateLimitError) {
        const wait = Math.ceil(err.retryAfter / 60);
        reveal(botId, `Too many questions for now — try again in about ${wait} minute${wait > 1 ? 's' : ''}.`, () =>
          finishBot(botId, { model: 'rate limited' }),
        );
        return;
      }
      /* backend unreachable — answer on-device with the same shape */
      const t0 = performance.now();
      const qvec = await embed(q);
      const retrieved = retrieve(qvec, 4);
      onSources({
        sources: retrieved.map((r) => ({ id: r.id, kind: r.kind, title: r.title, score: r.s })),
        retrieval_ms: Math.round((performance.now() - t0) * 10) / 10,
        retrieval_model: 'keyword vectors, on-device',
      });
      const res = await localAnswer(q, retrieved);
      record(res.text);
      reveal(botId, res.text, () => finishBot(botId, { model: res.label }));
    }
  }, [busy, graphRef, patchMessage, reveal, finishBot]);

  const exitChat = useCallback(() => {
    clearInterval(revealTimer.current);
    setInChat(false);
    setBusy(false);
    setMessages([]);
    convoRef.current = [];
    graphRef.current?.clearQuery();
    graphRef.current?.setIntro(true);
  }, [graphRef]);

  return { inChat, busy, messages, ask, exitChat };
}
