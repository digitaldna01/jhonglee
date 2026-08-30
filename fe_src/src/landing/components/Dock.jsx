import { useState } from 'react';

const SEEDS = [
  { label: 'machine-learning work', q: 'What machine-learning work have you done?' },
  { label: 'typography & motion', q: 'Show me your typography and motion projects' },
  { label: 'who are you?', q: 'Who are you?' },
];

/* Seed chips + composer. The composer is SHARED between map and chat
   modes — it stays docked at the bottom across the transition. */
export default function Dock({ inChat, busy, onAsk, inputRef }) {
  const [value, setValue] = useState('');

  const submit = (q) => {
    if (!q.trim() || busy) return;
    onAsk(q);
    setValue('');
  };

  return (
    <div className="dock">
      <div className={`seeds${inChat ? ' gone' : ''}`}>
        {SEEDS.map(({ label, q }) => (
          <button key={label} type="button" className="seed" onClick={() => submit(q)}>
            {label}
          </button>
        ))}
      </div>

      <div className="composer">
        <span className="glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck="false"
          placeholder="Ask anything about me or my work…"
          aria-label="Ask about me or my work"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(value);
            }
          }}
        />
        <button
          type="button"
          className={`send${busy ? ' busy' : ''}`}
          aria-label="Send"
          disabled={busy || !value.trim()}
          onClick={() => submit(value)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
