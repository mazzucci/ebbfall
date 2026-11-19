// The docs' one script, /docs/docs.js (tools/docs/build.mjs copies it; a file, not inline: the site's CSP), deferred in
// every page's head: it runs once the page is parsed. The pages read whole without it.
(function () {
  // The top bar's tabs: the current one scrolled into view on a phone, where the four overflow the bar.
  var t = document.querySelector('.tabs'), a = t && t.querySelector('[aria-current]');
  if (a && a.offsetLeft + a.offsetWidth > t.clientWidth) t.scrollLeft = a.offsetLeft - (t.clientWidth - a.offsetWidth) / 2;
  // The home's clip and the controls videos (pages.mjs `clip`, `loop`): no controls once this runs, played only while in
  // view, never under reduced motion (their poster stays). Fetched only once the page has loaded: the posters, fonts and
  // plates first, on a slow first visit.
  var clips = document.querySelectorAll('.clip video');
  for (var i = 0; i < clips.length; i++) clips[i].controls = false;
  if (!clips.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
  function start() { for (var i = 0; i < clips.length; i++) watch(clips[i]); }
  function watch(v) {
    // A controls video's poster (pages.mjs controlsVideo, an image over it) goes once it plays.
    v.addEventListener('playing', function () { var p = v.nextElementSibling; if (p && p.className === 'poster') p.hidden = true; });
    if (!('IntersectionObserver' in window)) { v.play().catch(function () {}); return; }
    new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) v.play().catch(function () {}); else v.pause(); }); }).observe(v);
  }
})();
