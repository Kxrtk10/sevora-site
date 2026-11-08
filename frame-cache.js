/* SEVORA frame cache: scroll-driven image sequences stall when the browser has to decode a frame at the moment it is
   drawn. This decodes the frames just ahead of (and behind) the one on screen in the background, keeps a small window
   of them ready, and draws from that window. Memory stays bounded; if anything is unsupported, drawing works as before. */
(() => {
  if (!window.createImageBitmap || !window.fetch) return;
  const touch = matchMedia('(pointer:coarse)').matches;
  const MAX = touch ? 24 : 48, AHEAD = touch ? 6 : 10;
  const re = /^(.*?)(\d{3})(\.(?:webp|jpe?g|png|avif))(\?.*)?$/i;
  const ready = new Map(), pending = new Set(), missing = new Set();
  function want(url) {
    if (ready.has(url) || pending.has(url) || missing.has(url)) return;
    pending.add(url);
    fetch(url).then(r => r.ok ? r.blob() : Promise.reject(r.status))
      .then(b => createImageBitmap(b))
      .then(bm => {
        pending.delete(url); ready.set(url, bm);
        while (ready.size > MAX) { const [k, v] = ready.entries().next().value; ready.delete(k); v.close && v.close(); }
      })
      .catch(() => { pending.delete(url); missing.add(url); });
  }
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (img && img.tagName === 'IMG') {
      const src = img.currentSrc || img.src, m = src && re.exec(src);
      if (m) {
        const n = +m[2], w = m[2].length;
        for (let d = 1; d <= AHEAD; d++) {
          want(m[1] + String(n + d).padStart(w, '0') + m[3]);
          if (n - d >= 1) want(m[1] + String(n - d).padStart(w, '0') + m[3]);
        }
        const bm = ready.get(src);
        if (bm) { ready.delete(src); ready.set(src, bm); return draw.call(this, bm, ...rest); }
        want(src);
      }
    }
    return draw.call(this, img, ...rest);
  };
})();
