# Above

A little, touchscreen-only, top-down pixel-art adventure about a sheepdog, the forest, and a flock that has wandered away.

**[Play on GitHub Pages](https://joramvanloenen.github.io/Above/)** (once GitHub Pages is enabled for the repository).

## Playing

- **Touch and drag anywhere** to walk in that direction. Movement uses an invisible analogue joystick with its origin under your finger; lift your finger to stop.
- **Tap BARK** to bark. Nearby sheep move away from the dog, so get behind them and guide them toward the pale stone circle.
- Bring **8 sheep** to the home circle to complete the first objective.
- Explore the woodland for **three old wind chimes**. Bark close to them to wake them.

There are no on-screen directional controls, keyboard requirements, asset downloads, accounts, ads, analytics, or external libraries. The world, pixel-art sprites, foliage, animation, and sound effects are procedurally generated in the browser.

## Art direction

A muted yellow-green meadow with tiny patches of wildflowers and grass; thick clumps of blue-green foliage with jagged plum shadows; ivory sheep, warm lavender ruins, and soft displaced tree shadows. Sprites have visible trunks, layered crowns and flattened elliptical ground footprints, implying a camera tilted slightly lower than perfectly overhead. Rendered with a low-resolution canvas and integer pixel snapping for sharp pixels on a mobile phone.

## Architecture

- index.html — full-screen game canvas and minimal overlay (only one action button)
- style.css — touch-safe mobile layout with safe-area insets
- game.js — rendering, procedural environment, touch input, flock steering, objectives, generated art, and Web Audio sound
- .github/workflows/pages.yml — static deployment to GitHub Pages

Simply open index.html in a browser to run locally. No build, bundler, or server is required.

## Deployment

The Pages workflow publishes the root of main on pushes. If the site is not live yet, enable **Settings → Pages → Build and deployment → GitHub Actions** in this repo. The workflow should then deploy on the next push. This project is designed for portrait and landscape mobile screens and runs fully offline after the static files are loaded.

The visual language was inspired by the screenshots supplied for this project. All art is original, runtime-generated pixel art rather than artwork copied from the screenshots.