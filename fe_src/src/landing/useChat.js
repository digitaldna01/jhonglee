/* ============================================================
   Landing — chat session state machine
   ------------------------------------------------------------
   Owns the conversation: entering/leaving chat mode, the message
   list, streaming updates, the intro handoff (the map slides out
   while a chat is open — see landing.css .is-chat), and its address
   (/chat/:sid — loaded from the server when arrived at by URL).

   Answer path: backend SSE first; if the backend is unreachable
   the on-device stand-in (data/retrieval + rag/generate) takes
   over with the same message shape — the UI never special-cases.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ForbiddenError, NotFoundError, RateLimitError, fetchConversation, streamAnswer } from './rag/client';
import { embed, retrieve } from './data/retrieval';
import { answer as localAnswer, HISTORY_MAX } from './rag/generate';
import { historyFromTurns, messagesFromTurns, nonBio } from './transcript';
import { startAnswerBlink, stopAnswerBlink } from './favicon';

let nextId = 1;
const mint = () => crypto.randomUUID();

/* `sid` is the conversation the URL names (undefined on "/"). The address is
   the state: a conversation opened by link, reload or the back button is
   loaded from the server; one started here gets its address after the
   first answer (navigate replace), and leaving for "/" resets the room. */
export default function useChat(graphRef, sid) {
  const navigate = useNavigate();
  const [inChat, setInChat] = useState(Boolean(sid));
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [canContinue, setCanContinue] = useState(true);
  const [missing, setMissing] = useState(false); // the URL names a conversation that does not exist

  // the tab's dot blinks while the answer streams (see favicon.js)
  useEffect(() => {
    if (busy) startAnswerBlink();
    else stopAnswerBlink();
    return stopAnswerBlink;
  }, [busy]);
  const sessionRef = useRef(sid ?? null); // the address of the current conversation, minted on the first ask
  const selfNavRef = useRef(null); // the sid we put in the URL ourselves — consumed once, so that arrival is not a reload
  const prevSidRef = useRef(sid);
  const convoRef = useRef([]); // [{role, content}] — multiturn context
  const revealTimer = useRef(0);

  const reset = useCallback(() => {
    clearInterval(revealTimer.current);
    setInChat(false);
    setBusy(false);
    setMessages([]);
    setCanContinue(true);
    setMissing(false);
    convoRef.current = [];
    sessionRef.current = null;
    graphRef.current?.setIntro(true);
  }, [graphRef]);

  // (refs, not the marker alone: StrictMode runs this twice in dev and a
  // guard that survives the rerun would swallow the load)
  useEffect(() => {
    const prev = prevSidRef.current;
    prevSidRef.current = sid;
    if (!sid) {
      if (prev) reset(); // back to "/" from an address: the map again, a fresh room
      return undefined;
    }
    if (selfNavRef.current === sid) {
      selfNavRef.current = null; // our own navigation after the first answer — already on screen
      return undefined;
    }
    sessionRef.current = sid;
    setInChat(true);
    setMissing(false);
    graphRef.current?.setIntro(false);
    let cancelled = false;
    fetchConversation(sid)
      .then((c) => {
        if (cancelled) return;
        setMessages(messagesFromTurns(c.turns));
        convoRef.current = historyFromTurns(c.turns, HISTORY_MAX);
        setCanContinue(c.canContinue);
      })
      .catch((err) => {
        if (cancelled) return;
        setMessages([]);
        setCanContinue(false);
        setMissing(true);
        if (!(err instanceof NotFoundError)) console.warn(err);
      });
    return () => {
      cancelled = true;
    };
  }, [sid, graphRef, reset]);

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
    if (!q || busy || !canContinue) return;
    const address = sessionRef.current ?? (sessionRef.current = mint());

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
      patchMessage(botId, {
        sources: nonBio(payload.sources),
        foot: {
          retrievalMs: payload.retrieval_ms,
          retrievalModel: payload.retrieval_model,
        },
      });
    };

    try {
      let answerText = '';
      const done = await streamAnswer({
        question: q,
        sessionId: address,
        history,
        onSources,
        onDelta: (chunk) => {
          answerText += chunk;
          patchMessage(botId, { text: answerText });
        },
      });
      record(answerText);
      finishBot(botId, { model: done.model });
      if (sid !== address) {
        selfNavRef.current = address; // the URL catches up with what is on screen
        navigate(`/chat/${address}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ForbiddenError) {
        setCanContinue(false);
        reveal(botId, 'This conversation was started in another browser — it is read-only here.',
          () => finishBot(botId, { model: 'not yours' }));
        return;
      }
      if (err instanceof RateLimitError) {
        const wait = Math.ceil(err.retryAfter / 60);
        const text =
          err.scope === 'global'
            ? "I've answered a lot of questions today and I'm taking a rest — please come back tomorrow."
            : `Too many questions for now — try again in about ${wait} minute${wait > 1 ? 's' : ''}.`;
        reveal(botId, text, () => finishBot(botId, { model: 'rate limited' }));
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
  }, [busy, canContinue, sid, navigate, graphRef, patchMessage, reveal, finishBot]);

  /* "back to map": from an address, go home and let the URL effect reset;
     on "/" (before the first answer) reset directly */
  const exitChat = useCallback(() => {
    if (sid) navigate('/');
    else reset();
  }, [sid, navigate, reset]);

  return { inChat, busy, messages, canContinue, missing, sessionId: sessionRef.current, ask, exitChat };
}
