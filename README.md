# Kogasa Studio website

Static site for Kogasa Studio (小傘, "small umbrella"). Plain HTML, CSS and JavaScript, no build step.

## Preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works.

## Files

- `index.html` – the page: ink landscape header, "After the rain" colour section with the stamp book, principles, contact
- `styles.css` – design tokens at the top (`--paper`, `--ink`, `--seal`, `--gold`, fonts); the header parallax and fade are CSS scroll-driven animations
- `ink.js` – shared seeded noise and washi paper grain for the painted canvases
- `landscape.js` – the grey ink-wash header: one canvas per layer, plus rain, walker and wind drawn every frame; on narrow screens it shows a crop of the panorama
- `landscape-gl.js` – the header's ink washes and mist as WebGL shaders, fast enough to repaint on every frame of a resize (the canvas painting in `landscape.js` is the fallback)
- `colour.js` – the colour painting behind the stamp book: watercolour blooms, plum branch, gold leaf
- `main.js` – grey-to-colour fade, stamps pressing in, copy button, and the scroll fallback for browsers without scroll-driven animations
- `assets/` – FoilFold icon and favicon

The paintings are seeded: change `SEED` in `landscape.js` or `colour.js` to repaint with a
different composition in the same style.

## Adding an app

Copy FoilFold's `<article class="chapter chapter--app">` in the stamp book and change:

- the chapter numeral in the eyebrow (壱, 弐, 参, 肆, 伍 …) and `--accent` on the card
- on the sheet: `--hue` (watercolour wash), `--tilt`, the vertical title, and the seal's
  character, colour (`--stamp`) and tilt (`--r`)
- the text: icon, name, pitch, features, platforms and links
- the screenshots in `assets/<app>/`

Move the blank "Not yet" chapter to the end and renumber it.
