// The docs' one script, /docs/docs.js (tools/docs/build.mjs copies it; a file, not inline: the site's CSP), deferred in
// every page's head: it runs once the page is parsed. The pages read whole without it.
(function () {
  // Scripts run: the touch table's ? buttons show (docs.css `.js .see`; hidden until then, as they would do nothing).
  document.documentElement.classList.add('js');
  // The top bar's tabs: the current one scrolled into view on a phone, where the four overflow the bar.
  var t = document.querySelector('.tabs'), a = t && t.querySelector('[aria-current]');
  if (a && a.offsetLeft + a.offsetWidth > t.clientWidth) t.scrollLeft = a.offsetLeft - (t.clientWidth - a.offsetWidth) / 2;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The home's clip and the controls videos (pages.mjs `clip`: the phone's and the desktop's loops): no controls once this
  // runs, each played only while in view (its own observer: one scrolled out pauses while another plays), never under
  // reduced motion (their poster stays). Fetched only once the page has loaded: the posters, fonts and
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
  // The controls tables' gestures (pages.mjs gestureLoop, the touch and the desktop rows): a row's ? opens its loop in the
  // box under the row's words and plays it; the ? again closes it; opening another, anywhere in the page, closes the one open. The video and its poster are made here, on
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

// The feedback form (/docs/feedback/: pages.mjs feedbackForm): its counter, the details filled in, and SEND, as JSON to
// the site's Worker (site/feedback.js, which checks it all again). Sent: the thank-you. Not sent (the Worker blocked,
// error 1103; a limit; the email failed; any answer but `{ ok: true }`): a line to write to us instead, its mailto link
// carrying the kind and the text.
(function () {
  var form = document.getElementById('feedback');
  if (!form) return;
  var TO = 'contact@ebbfall.com', MAILTO_MAX = 1800;
  var text = form.elements.text, count = document.getElementById('fb-count'), max = +count.getAttribute('data-max');
  var fail = document.getElementById('fb-fail'), mailto = document.getElementById('fb-mailto'), send = form.querySelector('.send');
  var q = new URLSearchParams(location.search);
  var fmt = function (n) { return n.toLocaleString('en-US'); };
  function counter() { var n = text.value.length; count.textContent = fmt(n) + ' / ' + fmt(max); count.classList.toggle('near', n > max * 0.9); }
  text.addEventListener('input', counter);
  counter();

  // The details: the game's version (a link from the game passes it, `v` and `c`, else this page's stamp), the browser
  // and system in a few words, the screen, touch or mouse (the game's `touch`, else the pointer), where it came from (the
  // game's `from`, else the address of the page before, on this site only).
  var v = q.get('v') || '', c = q.get('c') || '', stamp = document.getElementById('fb-stamp');
  var details = {
    version: /^([0-9a-f]{12}|dev)$/.test(v) ? 'Version ' + v + ' (last game update ' + (/^([0-9a-f]{7}|dev)$/.test(c) ? c : 'unknown') + ')' : (stamp ? stamp.textContent.trim() : ''),
    browser: browser(),
    screen: screen.width + 'x' + screen.height + ', window ' + innerWidth + 'x' + innerHeight + ', ' + Math.round((devicePixelRatio || 1) * 100) / 100 + 'x',
    input: q.get('touch') === '1' ? 'touch' : q.get('touch') === '0' ? 'mouse' : matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
    from: from(),
  };
  for (var k in details) {
    var d = document.getElementById('fb-d-' + k), h = document.getElementById('fb-' + k);
    if (h) h.value = details[k];
    if (d) d.textContent = details[k] || 'Not known';
  }
  function from() {
    var f = q.get('from');
    if (f === 'game' || f === 'menu') return f;
    try { var r = new URL(document.referrer); if (r.origin === location.origin) return r.pathname.replace(/[^\w./-]/g, '').slice(0, 120); } catch (e) { /* none, or another site's */ }
    return '';
  }
  function browser() {
    var ua = navigator.userAgent, m, b, os = '';
    if ((m = ua.match(/Edg(?:A|iOS)?\/(\d+)/))) b = 'Edge ' + m[1];
    else if ((m = ua.match(/OPR\/(\d+)/))) b = 'Opera ' + m[1];
    else if ((m = ua.match(/SamsungBrowser\/(\d+)/))) b = 'Samsung Internet ' + m[1];
    else if ((m = ua.match(/(?:Firefox|FxiOS)\/(\d+)/))) b = 'Firefox ' + m[1];
    else if ((m = ua.match(/(?:Chrome|CriOS)\/(\d+)/))) b = 'Chrome ' + m[1];
    else if ((m = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari\//))) b = 'Safari ' + m[1];
    else b = 'Unknown browser';
    if ((m = ua.match(/(?:iPhone|CPU) OS (\d+)(?:_(\d+))?/))) os = (/iPad/.test(ua) ? 'iPadOS ' : 'iOS ') + m[1] + (m[2] ? '.' + m[2] : '');
    else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = 'Android ' + m[1];
    else if (/Macintosh/.test(ua)) os = navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return (b + (os ? ' on ' + os : '')).replace(/[^\w .,:;()/+-]/g, '').slice(0, 80);
  }

  function kind() { var r = form.querySelector('input[name=kind]:checked'); return r ? r.value : 'Other'; }
  // A mailto link with the kind and the text, the text cut so the whole address stays short enough for every mail app.
  function mailLink() {
    var subject = encodeURIComponent('[Ebbfall feedback] ' + kind()), t = text.value, cut = false, body;
    for (;;) {
      body = encodeURIComponent(t + (cut ? '...' : '') + '\n\n' + details.version);
      if (body.length <= MAILTO_MAX - subject.length || !t) break;
      t = t.slice(0, Math.floor(t.length * 0.8)); cut = true;
    }
    return 'mailto:' + TO + '?subject=' + subject + '&body=' + body;
  }
  function failed() { mailto.href = mailLink(); fail.hidden = false; send.disabled = false; send.textContent = 'Send'; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    fail.hidden = true; send.disabled = true; send.textContent = 'Sending...';
    var body = { kind: kind(), text: text.value, email: form.elements.email.value.trim(), website: form.elements.website.value, elapsed: Math.round(performance.now()), details: details };
    fetch(form.getAttribute('action'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        if (!r || r.ok !== true) return failed();
        var done = document.getElementById('fb-done');
        form.hidden = true; done.hidden = false; done.focus();
      })
      .catch(failed);
  });
})();
