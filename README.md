# Above

A little, touchscreen-only, top-down pixel-art adventure about a knight, a loyal sheepdog, the forest, and a flock that has wandered away.

**[Play on GitHub Pages](https://joramvanloenen.github.io/Above/)** (once GitHub Pages is enabled for the repository).

## Playing

- **You start as the knight**, with the dog following along as an autonomous companion.
- **Touch and drag anywhere** to move the selected character. There is no visible movement pad.
- **Tap the character switch at the top** to control the dog; the knight then follows you instead.
- **Knight ATTACK:** Tap to swing your sword. Tap again during the swing (or within 0.62 seconds after it ends) to chain into a second, reverse-direction swing. Tap again quickly for a **third, wider, more powerful finisher**. Taps during a swing are buffered.
- **Targets:** Bramble patches have 3 HP; the first two strikes deal 1 damage each, while the third deals 3 and breaks a bramble instantly. Straw dummies can be hit repeatedly without disappearing. Sheep cannot be hurt by the sword.
- **Dog BARK:** Startle nearby sheep and steer them toward the stone circle. Sheep can also flee from a dog approaching too closely.
- **Contextual action:** Approach an unactivated ancient wind chime; the same bottom-right button changes to **USE** for either character.
- Return **8 sheep** to the home circle to complete the herding objective. Explore for **three hidden chimes**.

Only two buttons are visible: the top character switch and the bottom-right context-sensitive attack / bark / use button. The world, pixel art, tree varieties, animation, and sound effects are generated in the browser, without external art libraries or downloads.

## Art direction

A muted yellow-green meadow with tiny patches of wildflowers and grass; thick clumps of blue-green foliage with jagged plum shadows, five distinct tree families (rounded, conifer, wide-spreading, coppice and willow), varied sizes and warm-violet twilight groves; ivory sheep, warm lavender ruins, and soft displaced tree shadows. Sprites have visible trunks, layered crowns and flattened elliptical ground footprints, implying a camera tilted slightly lower than perfectly overhead. Rendered with a low-resolution canvas and integer pixel snapping for sharp pixels on a mobile phone.

## Architecture

- index.html — full-screen game canvas and minimal overlay (only one action button)
- style.css — touch-safe mobile layout with safe-area insets
- game.js — rendering, procedural environment, touch input, flock steering, objectives, generated art, and Web Audio sound, knight/dog follower AI, contextual interactions and three-strike sword combat
- .github/workflows/pages.yml — static deployment to GitHub Pages

Simply open index.html in a browser to run locally. No build, bundler, or server is required.

## Deployment

The Pages workflow publishes the root of main on pushes. If the site is not live yet, enable **Settings → Pages → Build and deployment → GitHub Actions** in this repo. The workflow should then deploy on the next push. This project is designed for portrait and landscape mobile screens and runs fully offline after the static files are loaded.

The visual language was inspired by the screenshots supplied for this project. All art is original, runtime-generated pixel art rather than artwork copied from the screenshots.