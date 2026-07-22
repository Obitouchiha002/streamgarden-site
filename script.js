// Two small behaviours: reveal sections as they scroll in, and run the hero's
// download animation so the page shows what the app does instead of describing it.

// ── sticky header hairline ──────────────────────────────────────────
const hdr = document.getElementById('hdr');
const onScroll = () => hdr.classList.toggle('stuck', window.scrollY > 8);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

// ── scroll reveal ───────────────────────────────────────────────────
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rises = document.querySelectorAll('.rise');

if (reduced || !('IntersectionObserver' in window)) {
  rises.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        // Stagger siblings slightly so a grid doesn't pop in as one block.
        setTimeout(() => e.target.classList.add('in'), i * 70);
        io.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
  );
  rises.forEach((el) => io.observe(el));

  // Safety net: if the observer never fires (odd in-app browsers, restored tabs), show
  // everything anyway rather than leaving the page blank.
  setTimeout(() => rises.forEach((el) => el.classList.add('in')), 2500);
}

// ── hero: video + audio download, then merge ────────────────────────
const viz = document.getElementById('viz');
if (viz && !reduced) {
  const bars = { v: viz.querySelector('[data-bar="v"]'), a: viz.querySelector('[data-bar="a"]') };
  const pcts = { v: viz.querySelector('[data-pct="v"]'), a: viz.querySelector('[data-pct="a"]') };
  const mergeText = document.getElementById('mergeText');
  const result = document.getElementById('result');

  const set = (k, n) => {
    bars[k].style.width = n + '%';
    pcts[k].textContent = Math.round(n) + '%';
  };

  let timer = null;
  const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

  async function run() {
    // reset
    set('v', 0); set('a', 0);
    result.classList.remove('on');
    mergeText.textContent = 'waiting for both streams';

    // The audio track is much smaller, so it finishes first — same as the real thing.
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

  // Only animate while the hero is actually on screen.
  const vio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) run();
      else if (timer) { clearTimeout(timer); timer = null; }
    });
  }, { threshold: 0.25 });
  vio.observe(viz);
}
