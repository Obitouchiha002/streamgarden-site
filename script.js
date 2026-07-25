// Three behaviours: the download card, the mobile panel switching, and the small
// touches that make the page feel alive (reveals + the hero download animation).

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 820px)').matches;

/* ── download card ─────────────────────────────────────────────── */
const bg = document.getElementById('dlBg');
const openCard = () => {
  bg.hidden = false;
  document.body.style.overflow = 'hidden';
  bg.querySelector('.dl-go').focus({ preventScroll: true });
};
const closeCard = () => {
  bg.hidden = true;
  if (!isMobile()) document.body.style.overflow = '';
};

document.querySelectorAll('[data-download]').forEach((el) =>
  el.addEventListener('click', (e) => { e.preventDefault(); openCard(); })
);
document.getElementById('dlClose').addEventListener('click', closeCard);

/* Platform switch — defaults to whichever OS the visitor is on. */
const PLATFORMS = ['android', 'windows', 'mac'];
const psTabs = { android: 'psAndroid', windows: 'psWindows', mac: 'psMac' };
const psPans = { android: 'panAndroid', windows: 'panWindows', mac: 'panMac' };

function showPlatform(which) {
  if (!PLATFORMS.includes(which)) which = 'windows';
  for (const p of PLATFORMS) {
    const on = p === which;
    const tab = document.getElementById(psTabs[p]);
    const pan = document.getElementById(psPans[p]);
    if (tab) { tab.classList.toggle('on', on); tab.setAttribute('aria-selected', String(on)); }
    if (pan) pan.hidden = !on;
  }
}

for (const p of PLATFORMS) {
  document.getElementById(psTabs[p])?.addEventListener('click', () => showPlatform(p));
}

// A visitor on a desktop almost certainly wants the desktop build, not an APK. Detect Mac
// before Windows, and treat iPhone/iPad as Android (the closest downloadable build).
const ua = navigator.userAgent;
showPlatform(/Android/i.test(ua) ? 'android'
  : /Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua) ? 'mac'
  : /Windows/i.test(ua) ? 'windows'
  : /Mobile|iPhone|iPad/i.test(ua) ? 'android' : 'windows');
bg.addEventListener('click', (e) => { if (e.target === bg) closeCard(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bg.hidden) closeCard(); });
// Let the download start, then get out of the way. (Any download button in the card.)
bg.querySelectorAll('.dl-go').forEach((b) => b.addEventListener('click', () => setTimeout(closeCard, 600)));

/* ── mobile panels ─────────────────────────────────────────────── */
const panels = [...document.querySelectorAll('.panel')];
const tabs = [...document.querySelectorAll('.tab[data-go]')];

function show(id) {
  const panel = document.getElementById(id);
  if (!panel) return;

  if (isMobile()) {
    panels.forEach((p) => p.classList.toggle('active', p === panel));
    panel.scrollTop = 0;
    // Reveals inside a freshly shown panel would never intersect; just show them.
    panel.querySelectorAll('.rise').forEach((el) => el.classList.add('in'));
  } else {
    panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.go === id));
}

document.querySelectorAll('[data-go]').forEach((el) =>
  el.addEventListener('click', (e) => { e.preventDefault(); show(el.dataset.go); })
);

// Coming back to a wide window must not leave panels hidden.
const syncLayout = () => {
  if (isMobile()) {
    if (!panels.some((p) => p.classList.contains('active'))) panels[0].classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    panels.forEach((p) => p.classList.remove('active'));
    document.body.style.overflow = '';
  }
};
syncLayout();
addEventListener('resize', syncLayout);

/* ── header hairline (desktop scroll) ──────────────────────────── */
const hdr = document.getElementById('hdr');
const onScroll = () => hdr.classList.toggle('stuck', scrollY > 8);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

/* ── reveal on scroll ──────────────────────────────────────────── */
const rises = document.querySelectorAll('.rise');
if (reduced || !('IntersectionObserver' in window)) {
  rises.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e, i) => {
      if (!e.isIntersecting) return;
      setTimeout(() => e.target.classList.add('in'), i * 60);
      io.unobserve(e.target);
    }),
    { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
  );
  rises.forEach((el) => io.observe(el));
  // Safety net — never leave the page blank if the observer misbehaves.
  setTimeout(() => rises.forEach((el) => el.classList.add('in')), 2500);
}

/* ── hero: two streams down, then merged ───────────────────────── */
const viz = document.getElementById('viz');
if (viz && !reduced) {
  const bars = { v: viz.querySelector('[data-bar="v"]'), a: viz.querySelector('[data-bar="a"]') };
  const pcts = { v: viz.querySelector('[data-pct="v"]'), a: viz.querySelector('[data-pct="a"]') };
  const mergeText = document.getElementById('mergeText');
  const result = document.getElementById('result');

  const set = (k, n) => { bars[k].style.width = n + '%'; pcts[k].textContent = Math.round(n) + '%'; };
  let timer = null;
  const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

  async function run() {
    set('v', 0); set('a', 0);
    result.classList.remove('on');
    mergeText.textContent = 'waiting for both streams';

    // Audio is the smaller file, so it finishes first — same as the real download.
    let v = 0, a = 0;
    while (v < 100 || a < 100) {
      v = Math.min(100, v + 1.6 + Math.random() * 2.2);
      a = Math.min(100, a + 4.5 + Math.random() * 3.5);
      set('v', v); set('a', a);
      await wait(46);
    }
    mergeText.textContent = 'merging — no re-encode';
    await wait(700);
    result.classList.add('on');
    mergeText.textContent = 'done';
    await wait(2600);
    run();
  }

  new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) run();
    else if (timer) { clearTimeout(timer); timer = null; }
  }), { threshold: 0.25 }).observe(viz);
}
