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
- `landscape.js` – the grey ink-wash header: each layer painted once on its own canvas; rain and the walker are the only things drawn every frame
- `colour.js` – the colour painting behind the stamp book: watercolour blooms, plum branch, gold leaf
- `main.js` – grey-to-colour fade, stamps pressing in, copy button, and the scroll fallback for browsers without scroll-driven animations
- `assets/` – FoilFold icon and favicon

The paintings are seeded: change `SEED` in `landscape.js` or `colour.js` to repaint with a
different composition in the same style.

## Adding an app

Copy FoilFold's `<figure class="sheet">` in the stamp book and change:

- `--hue` (the page's watercolour wash) and `--tilt` (how askew the sheet lies)
- the vertical title, the seal character and its colour (`--stamp`) and tilt (`--r`)
- the caption: icon, name, description and link
