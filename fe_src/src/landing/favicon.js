/* Tab-dot pulse — the favicon blinks in the caret's 1s rhythm while an answer
   is being generated, then the static icon comes back. Motion means "thinking",
   never decoration: idle tabs stay still (and Safari, which ignores dynamic
   favicons, simply keeps the static dot throughout).

   Implementation: browsers repaint the tab icon when the favicon <link>'s href
   changes, so two pre-rendered canvas frames (dot on / dot off) are swapped on
   an interval. The dot colour is read from --accent at start, so it follows
   the visitor's theme. */

const FRAME_MS = 500; // half the caret's 1s cycle: on, off, on…

let timer = null;
let dynamicLink = null;
let frames = null;
let parked = []; // the static <link>s, detached while blinking — the browser
// picks its favourite among all candidates (Chrome prefers the SVG), so the
// animated frame must be the only one in the head

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function drawFrames() {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1a47d6';
  return [1, 0.15].map((alpha) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(32, 32, 23, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL('image/png');
  });
}

export function startAnswerBlink() {
  if (timer || reducedMotion()) return;
  try {
    frames = drawFrames();
  } catch {
    return; // canvas unavailable → keep the static icon
  }
  parked = [...document.querySelectorAll('link[rel~="icon"]')];
  parked.forEach((l) => l.remove());
  if (!dynamicLink) {
    dynamicLink = document.createElement('link');
    dynamicLink.rel = 'icon';
    dynamicLink.type = 'image/png';
  }
  document.head.appendChild(dynamicLink);
  let on = true;
  dynamicLink.href = frames[0];
  timer = setInterval(() => {
    on = !on;
    dynamicLink.href = frames[on ? 0 : 1];
  }, FRAME_MS);
}

export function stopAnswerBlink() {
  if (timer) clearInterval(timer);
  timer = null;
  if (dynamicLink) {
    dynamicLink.remove();
    dynamicLink = null;
  }
  parked.forEach((l) => document.head.appendChild(l)); // statics take over again
  parked = [];
}
