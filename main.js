// Kogasa Studio — header scroll effects, stamp presses, and the copy button.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Header parallax and fade are CSS scroll-driven animations. Browsers without them get
// --scroll (px) from here instead, which the fallback rules in styles.css read.
const scrollDriven = Boolean(window.CSS && CSS.supports("animation-timeline: scroll()"));
const hero = document.querySelector(".hero");
let ticking = false;

function updateScroll() {
  ticking = false;
  const limit = hero.offsetHeight;
  const y = Math.min(Math.max(window.scrollY, 0), limit);
  hero.style.setProperty("--scroll", y.toFixed(1));
}

// After the rain: fade the colour painting in from grey as its section scrolls into view.
// The section's position is measured on load and resize only, never while scrolling.
const colourSection = document.querySelector(".colour");
let colourTop = 0;
let colourValue = "";

function measureColour() {
  if (colourSection) colourTop = colourSection.getBoundingClientRect().top + window.scrollY;
}

function updateColour() {
  if (!colourSection) return;
  let value = "1";
  if (!reduceMotion.matches) {
    const vh = window.innerHeight;
    const top = colourTop - window.scrollY;
    value = Math.min(Math.max((vh * 0.95 - top) / (vh * 0.75), 0), 1).toFixed(2);
  }
  if (value === colourValue) return;
  colourValue = value;
  colourSection.style.setProperty("--colour", value);
}

window.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    if (!scrollDriven && !reduceMotion.matches) updateScroll();
    updateColour();
  });
}, { passive: true });
window.addEventListener("resize", () => { measureColour(); updateColour(); });
window.addEventListener("load", () => { measureColour(); updateColour(); });
if (!scrollDriven) updateScroll();
measureColour();
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
