// The docs' one script, /docs/docs.js (tools/docs/build.mjs copies it; a file, not inline: the site's CSP), deferred in
// every page's head: it runs once the page is parsed. The pages read whole without it.
(function () {
  // Scripts run: the touch table's ? buttons show (docs.css `.js .see`; hidden until then, as they would do nothing).
  document.documentElement.classList.add('js');
  // The top bar's tabs: the current one scrolled into view on a phone, where the four overflow the bar.
  var t = document.querySelector('.tabs'), a = t && t.querySelector('[aria-current]');
  if (a && a.offsetLeft + a.offsetWidth > t.clientWidth) t.scrollLeft = a.offsetLeft - (t.clientWidth - a.offsetWidth) / 2;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The home's clip and the controls video (pages.mjs `clip`): no controls once this runs, played only while in view,
  // never under reduced motion (their poster stays). Fetched only once the page has loaded: the posters, fonts and
  // plates first, on a slow first visit.
  var clips = document.querySelectorAll('.clip video');
  for (var i = 0; i < clips.length; i++) clips[i].controls = false;
  if (clips.length && !reduce) { if (document.readyState === 'complete') start(); else addEventListener('load', start); }
  function start() { for (var i = 0; i < clips.length; i++) watch(clips[i]); }
  function watch(v) {
    // A controls video's poster (pages.mjs controlsVideo, an image over it) goes once it plays.
    v.addEventListener('playing', function () { var p = v.nextElementSibling; if (p && p.className === 'poster') p.hidden = true; });
    if (!('IntersectionObserver' in window)) { v.play().catch(function () {}); return; }
    new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) v.play().catch(function () {}); else v.pause(); }); }).observe(v);
  }
  // The touch table's gestures (pages.mjs gestureLoop): a row's ? opens its loop in the box under the row's words and
  // plays it; the ? again closes it; opening another closes the one open. The video and its poster are made here, on
  // the tap, from the button's data (nothing of a loop is fetched before it). Under reduced motion the poster shows
  // with the video's controls instead, and the person chooses to play.
  var MEDIA = '/docs/media/controls/', sees = document.querySelectorAll('button.see'), open = null;
  for (var j = 0; j < sees.length; j++) sees[j].addEventListener('click', function (e) { var b = e.currentTarget; if (open === b) close(b); else { if (open) close(open); show(b); } });
  function boxOf(b) { return document.getElementById(b.getAttribute('aria-controls')); }
  function show(b) {
    var d = b.dataset, v = document.createElement('video'), vid = document.createElement('div'), box = boxOf(b);
    v.muted = true; v.loop = true; v.playsInline = true; v.controls = reduce; v.preload = reduce ? 'none' : 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.width = +d.w; v.height = +d.h; v.title = d.label; v.setAttribute('aria-label', d.label);
    v.poster = MEDIA + d.loop + '.webp'; v.src = MEDIA + d.loop + '.mp4';
    vid.className = 'vid'; vid.appendChild(v); box.appendChild(vid);
    box.hidden = false; b.setAttribute('aria-expanded', 'true'); open = b;
    if (!reduce) v.play().catch(function () {});
  }
  function close(b) {
    var box = boxOf(b), v = box.querySelector('video');
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    box.textContent = ''; box.hidden = true; b.setAttribute('aria-expanded', 'false'); open = null;
  }
})();
