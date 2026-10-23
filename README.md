# Kogasa Studio website

Static site for Kogasa Studio (小傘, "small umbrella"). Plain HTML, CSS and JavaScript, no build step.

## Preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works.

## Files

- `index.html` – the page: ink landscape header, "After the rain" colour section with the stamp book, principles, contact
- `styles.css` – design tokens at the top (`--paper`, `--ink`, `--seal`, `--gold`, fonts)
- `ink.js` – shared seeded noise and washi paper grain for the painted canvases
- `landscape.js` – the grey ink-wash header: mountains, mist, pines, rain and the walker
- `colour.js` – the colour painting behind the stamp book: watercolour blooms, plum branch, gold leaf
- `main.js` – header fade on scroll, grey-to-colour fade, stamps pressing in, copy button
- `assets/` – FoilFold icon and favicon

The paintings are seeded: change `SEED` in `landscape.js` or `colour.js` to repaint with a
different composition in the same style.

## Adding an app

Copy a `<figure class="entry">` in the stamp book, set the vertical title, the seal
character and its tilt (`--r`), and update the caption.
