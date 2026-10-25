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

Only three controls are visible: the top character switch, a compact sword/crossbow switch and the bottom-right context-sensitive action button. The world, pixel art, tree varieties, animation, and sound effects are generated in the browser, without external art libraries or downloads.

## Adventure update

- **Crossbow:** While controlling the knight, tap the **SWORD / BOW** button at the top to switch weapons. **SHOOT** fires a fast bolt. It auto-adjusts slightly toward enemies in front of the knight and has a short cooldown. Switch back to the sword for the original three-hit combo.
- **Enemies:** Hooded **bandits** patrol woodland clearings; quick **green slimes** lunge at close range. Both chase and harm the knight, have hit points, display damage feedback and can be defeated with the sword or crossbow.
- **Boss:** The **Mire King** waits in the muddy bog toward the southeastern part of the valley (around world x 1483, y 1040). Its health bar appears when approached. It telegraphs charging attacks and summons more slimes below half health. The finisher and crossbow both damage it.
- **Tombs:** Three stone crypt entrances lead into distinct underground rooms: the **Crypt of Ash** (827, 1090), **Forgotten Vault** (356, 363) and **Weeping Tomb** (1286, 790). Stand by a stairwell and press **USE** to enter, fight floating **ghosts**, then press **USE** at the interior stairs to leave.
- **Health:** The knight has five hearts. Enemy contact or attacks remove a heart, with a brief invulnerability period. Losing all hearts returns the pair to the safe starting camp with full health.
- **Transparent trees:** When the knight or dog walks underneath an overlapping tree crown, that particular tree automatically fades so the character is visible. Unrelated trees remain opaque.
- **Touch only:** Touch-drag is still the only movement input, plus the small character switch, weapon switch, and one context-sensitive **ATTACK / SHOOT / BARK / USE** button.

The content is implemented with original runtime-drawn pixel art, mobile canvas rendering, generated sound and no third-party dependencies. Boss defeat and killed enemies persist during the current page session; there is not yet a save-game system.

## Biomes and encounters

The overworld is now made up of **five connected, visually distinct biomes** rather than uniformly dense forest. Tree density is substantially reduced overall, with groves concentrated in woodland regions so trails and enemies stay visible.

| Biome | Ground and vegetation | Native enemy | Combat style |
| --- | --- | --- | --- |
| **Sunlit Meadow** | Open yellow-green grass, wildflowers and a few solitary trees | **Bandits** | Armed patrols that pursue and strike |
| **Old Growth Woods** | Mossy green ground and clustered trees | **Wolves** | Fast pursuit followed by sudden pounces |
| **Sinking Mire** | Wet olive ground, reeds and mud | **Green slimes** | Hopping lunges; the Mire King rules this region |
| **Stony Highlands** | Pale stony terrain and scattered rocks | **Stone golems** | Slow heavy attacks that deal two hearts of damage |
| **Twilight Grove** | Muted violet soil and sparse purple woodland | **Wandering wisps** | Floating, weaving pursuit |

Each area uses its own enemy type: **71 roaming enemies across the five biomes**, plus **15 ghosts underground** and the Mire King boss. The camp and crypt entrances have safer approach zones. The top HUD changes to show the current biome while exploring, and the character-switch, sword, crossbow, sheep, crypt and tree-fading systems continue to work as before.

## Art direction

A muted yellow-green meadow with tiny patches of wildflowers and grass; sparser clusters of blue-green foliage with jagged plum shadows, five distinct tree families (rounded, conifer, wide-spreading, coppice and willow), varied sizes and warm-violet twilight groves; ivory sheep, warm lavender ruins, and soft displaced tree shadows. Sprites have visible trunks, layered crowns and flattened elliptical ground footprints, implying a camera tilted slightly lower than perfectly overhead. Rendered with a low-resolution canvas and integer pixel snapping for sharp pixels on a mobile phone.

## Architecture

- index.html — full-screen game canvas and minimal overlay (only one action button)
- style.css — touch-safe mobile layout with safe-area insets
- game.js — rendering, procedural environment, touch input, flock steering, objectives, generated art, and Web Audio sound, knight/dog follower AI, contextual interactions and three-strike sword combat
- .github/workflows/pages.yml — static deployment to GitHub Pages

Simply open index.html in a browser to run locally. No build, bundler, or server is required.

## Deployment

The Pages workflow publishes the root of main on pushes. If the site is not live yet, enable **Settings → Pages → Build and deployment → GitHub Actions** in this repo. The workflow should then deploy on the next push. This project is designed for portrait and landscape mobile screens and runs fully offline after the static files are loaded.

The visual language was inspired by the screenshots supplied for this project. All art is original, runtime-generated pixel art rather than artwork copied from the screenshots.