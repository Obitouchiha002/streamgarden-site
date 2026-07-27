/* StreamGarden landing — small and dependency-free. */

// ── Premium contact ──────────────────────────────────────────────────────
// Set this to the owner's WhatsApp number (country code, digits only, no + or spaces),
// e.g. '919876543210'. Until it's a real number the button explains it's coming soon.
const WA_NUMBER = '918800628376';
const WA_TEXT = "Hi! I'd like StreamGarden Premium (₹99 lifetime). My Device ID is: ";

(function wireWhatsApp() {
  const btns = document.querySelectorAll('.wa-btn');
  const note = document.getElementById('wa-note');
  if (WA_NUMBER && /^\d{10,15}$/.test(WA_NUMBER)) {
    const href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_TEXT)}`;
    btns.forEach((b) => { b.setAttribute('href', href); });
  } else {
    // No number yet — keep the button from opening a broken chat.
    btns.forEach((b) => {
      b.removeAttribute('target');
      b.setAttribute('href', '#getpremium');
      b.addEventListener('click', () => {
        if (note) note.textContent = 'WhatsApp contact is being set up — check back shortly.';
      });
    });
  }
})();

// ── sticky header shadow ──────────────────────────────────────────────────
const hdr = document.getElementById('hdr');
const onScroll = () => hdr.classList.toggle('stuck', window.scrollY > 8);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

// ── reveal on scroll ───────────────────────────────────────────────────────
const items = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        // small stagger for a group entering together
        setTimeout(() => e.target.classList.add('in'), Math.min(i * 60, 240));
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  items.forEach((el) => io.observe(el));
} else {
  items.forEach((el) => el.classList.add('in'));
}
