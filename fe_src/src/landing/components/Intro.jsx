/* The eyebrow deliberately carries ONLY the name — pre-declaring roles
   would answer the "who are you?" seed and remove the reason to ask. */
export default function Intro({ gone, onAsk }) {
  return (
    <div className={`intro${gone ? ' gone' : ''}`}>
      <p className="eyebrow">Jae Hong Lee</p>
      <h1>Ask me anything.</h1>
      <p>
        Every answer is retrieved from my own work and writing, and cited back
        to the source. Hover or tap a node to open it, or{' '}
        <button type="button" className="hint" onClick={onAsk}>ask below</button>.
      </p>
    </div>
  );
}
