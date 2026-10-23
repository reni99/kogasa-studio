// Kogasa Studio — header scroll effects, stamp presses, and the copy button.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Header: expose how far the header has scrolled as --scroll (px) for the CSS parallax and fade.
const hero = document.querySelector(".hero");
const root = document.documentElement;
let ticking = false;

function updateScroll() {
  ticking = false;
  const limit = hero.offsetHeight;
  const y = Math.min(Math.max(window.scrollY, 0), limit);
  root.style.setProperty("--scroll", y.toFixed(1));
}

// After the rain: fade the colour painting in from grey as its section scrolls into view.
const colourSection = document.querySelector(".colour");

function updateColour() {
  if (!colourSection) return;
  if (reduceMotion.matches) { colourSection.style.setProperty("--colour", "1"); return; }
  const top = colourSection.getBoundingClientRect().top;
  const vh = window.innerHeight;
  const progress = Math.min(Math.max((vh * 0.95 - top) / (vh * 0.75), 0), 1);
  colourSection.style.setProperty("--colour", progress.toFixed(3));
}

window.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    if (!reduceMotion.matches) updateScroll();
    else ticking = false;
    updateColour();
  });
}, { passive: true });
window.addEventListener("resize", updateColour);
updateScroll();
updateColour();

// Stamps: press each seal onto its page when the page scrolls into view.
const stamps = document.querySelectorAll(".stamp");
if (reduceMotion.matches || !("IntersectionObserver" in window)) {
  stamps.forEach((stamp) => stamp.classList.add("is-pressed"));
} else {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-pressed");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.6 });
  stamps.forEach((stamp) => observer.observe(stamp));
}

// Copy the email address.
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(target.textContent.trim());
      button.textContent = "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Selected";
    }
    setTimeout(() => (button.textContent = "Copy"), 2000);
  });
});
