// The docs' one script, /docs/docs.js (tools/docs/build.mjs copies it; a file, not inline: the site's CSP), at the end
// of every page's body. The pages read whole without it.
(function () {
  // The top bar's tabs: the current one scrolled into view on a phone, where the four overflow the bar.
  var t = document.querySelector('.tabs'), a = t && t.querySelector('[aria-current]');
  if (a && a.offsetLeft + a.offsetWidth > t.clientWidth) t.scrollLeft = a.offsetLeft - (t.clientWidth - a.offsetWidth) / 2;
  // The home's clip (pages.mjs `clip`): no controls once this runs, played only while in view, never under reduced motion.
  var clips = document.querySelectorAll('.clip video');
  for (var i = 0; i < clips.length; i++) watch(clips[i]);
  function watch(v) {
    v.controls = false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) { v.play().catch(function () {}); return; }
    new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) v.play().catch(function () {}); else v.pause(); }); }).observe(v);
  }
})();
