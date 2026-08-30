/* Which post images are worth enlarging, and what a click on one yields.
   Kept apart from the component so fast refresh sees a components-only file. */

export const ZOOM_GAIN = 1.25; // natural width must beat the displayed width by this much
export const TALL = 2.2;       // height / width beyond which the image scrolls instead of shrinking
const FILENAME = /\.(png|jpe?g|webp|gif|svg)$/i;

/** Flag every <img> under `root` that is worth enlarging (sets data-zoom). */
export function markZoomable(root) {
  if (!root) return;
  root.querySelectorAll('img').forEach((img) => {
    if (img.closest('[data-no-zoom], .sb-atelier')) return;
    const decide = () => {
      const worth = img.naturalWidth >= img.clientWidth * ZOOM_GAIN;
      if (worth) {
        img.setAttribute('data-zoom', '');
        // keyboard path: an image you can enlarge is a button
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', img.alt ? `${img.alt} — enlarge` : 'Enlarge image');
      } else {
        img.removeAttribute('data-zoom');
        img.removeAttribute('tabindex');
        img.removeAttribute('role');
        img.removeAttribute('aria-label');
      }
    };
    if (img.complete && img.naturalWidth) decide();
    else img.addEventListener('load', decide, { once: true });
  });
}

/** From a click inside the post body, the lightbox payload or null. */
export function zoomTarget(e) {
  const img = e.target.closest?.('img[data-zoom]');
  if (!img) return null;
  return {
    src: img.currentSrc || img.src,
    alt: img.alt && !FILENAME.test(img.alt.trim()) ? img.alt.trim() : '',
    w: img.naturalWidth,
    h: img.naturalHeight,
  };
}
