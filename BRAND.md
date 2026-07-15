# Leadly — Brand System · "Paper & Stage"

**Single source of truth for colour, type, radius, spacing, shadow and motion across every Leadly property:** `leadly.sg`, `/for/insurance`, `/for/insurance/deck`, `pulse.leadly.sg`, `app.leadly.sg`.

Everything lives as a CSS custom property in **`/assets/brand.css`**. Use the variables. **Never hardcode a hex, a radius, a font name or a pixel gap into a page.**

**Identity in one line: a white page, dark stages, one blue.**

---

## ⚠️ This voids the previous direction — entirely

The all-caps / green / no-dark-panels system is **dead**. None of it carries forward.

| Retired (do not reintroduce) | Replaced by |
|---|---|
| **Hanken Grotesk** | **Figtree** (one family, display + body) |
| **ALL-CAPS, weight 900, `line-height: 0.95`** display | **Sentence case, weight 600, `line-height: 1.12`**, tracked `-0.033em` |
| **Green** accent (`#2FB985` / `#147A54`) | Retired everywhere |
| **"No dark panels"** rule | **Reversed.** The dark panel is now the signature object |
| Green **tint wash** | **Pale blue** tint `#EBF1FE` |
| The `.bg-fx` glowing grid | Deleted — no glow, no gradients on the page |

Blue is **back as the brand colour**: cobalt `#0055E8`.

---

## The one idea

The page is **pure white** and mostly empty. Once — at the top — a single **dark rounded panel** (`.stage-dark`, `#0E0F11`, 26px radius) lifts off the paper on a soft blue-tinted shadow. **That panel is the product.** It is the only object on the page with weight. Everything else is white space, hairlines and quiet type.

**The stage is where the product runs.** It appears in the hero, once per product demo, and for *Our promise*. Nowhere else. Everything between the stages is white and quiet.

Every stage carries the same texture: black, a **hairline grid** on a 44px pitch, and **one cobalt bloom** that brightens on the beats of whatever is running. On the stage sit the objects — the **phone** (tilted left, with a real extruded flank and glass on top), the **window** (a flat product surface), and the **readout** (the stat column beside a device). They all live in `/assets/leadly-components.css`.

---

## Type

**One family: `Figtree`** (400–800), Google Fonts, `@import`ed at the top of `brand.css`. Swapping to a licensed face (Cera, Circular, Plus Jakarta) is a **one-line change to `--font`**. Nothing else moves.

Display is **sentence case, weight 600, tracked tight and negative**. Nothing shouts in caps except the tiny eyebrow labels.

The signature headline move: **the last line is set in the blue** — `<span class="accent">` — cobalt on white, `--panel-accent` (`#4D8CF0`) on the stage.

| Token | Value | Use |
|---|---|---|
| `--font` / `--font-display` | Figtree | Everything |
| `--fs-display` | `clamp(32px, 4.4vw, 58px)` | Hero display (600, sentence case) |
| `--fs-h2` | `clamp(24px, 2.8vw, 34px)` | Section header (600) |
| `--fs-body` | `17px` | Body copy (400) |
| `--fs-eyebrow` | `12px` | Eyebrow (600, uppercase, `+0.11em`) |
| `--lh-display` | `1.12` | Display — it breathes now |
| `--tracking-display` | `-0.033em` | The signature tracking |

Weights: **400** body · **500** medium · **600** display, headers, buttons · **700** H3 · **800** stats. **900 no longer exists.**

---

## Colour

### The page
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#FFFFFF` | The paper |
| `--canvas-sunk` | `#F7F8FA` | Alternating / recessed section |
| `--surface-2` | `#F5F6F8` | Input fill |

### The stage
| Token | Value | Use |
|---|---|---|
| `--panel` | `#0E0F11` | **The stage** |
| `--panel-2` | `#1A1C20` | A card sitting on the stage |
| `--on-panel` / `-2` / `-3` | white @ 100 / 68 / 44% | Text on the stage |
| `--panel-accent` | `#4D8CF0` | The blue that reads on dark |
| `--shadow-stage` | 3-layer, blue-tinted | The lift under the panel — nothing else gets it |

### Ink (on white)
`--ink` / `--text-1` `#0C111D` (18.9:1) · `--text-2` `#5A6473` (5.99:1) · `--text-3-aa` `#667085` (4.97:1) · `--text-3` `#98A2B3` — **decorative only, fails AA.**

### Blue — the single accent
Cobalt is a rare value: it passes AA **as text on white** (6.06:1) *and* takes **white text on top of it** (6.06:1). One hex does the link and the button.

| Token | Value | Use |
|---|---|---|
| `--accent` | `#0055E8` | Primary CTA fill, active state |
| `--accent-hover` | `#0047C4` | Hover |
| `--accent-ink` | `#0055E8` | Blue **as text** / links on white |
| `--accent-strong` | `#0039A0` | Deep emphasis (9.1:1) |
| `--on-accent` | `#FFFFFF` | Text on the blue pill |
| `--tint` | `#EBF1FE` | Pale blue wash — demo / image panel |
| `--tint-line` | `#D3E1FD` | Hairline inside a tint |

> **Accent discipline.** Blue is the CTA, the emphasis line, the active tab, the progress bar. It is not a background, not a section fill, not decoration. **One blue thing per view.**

---

## Radii · Spacing · Layout

Radii: `--r-sm` 8 · `--r-md` 12 · `--r-lg` 16 · `--r-xl` 24 · **`--r-stage` 26** · `--r-pill` 999.
Spacing (4px base): `--space-1`…`--space-10` (4 → 120). Section rhythm is `--space-9` (88px).
Layout: `--container` **1180px** · `--container-narrow` 760px · `--gutter` 28px.

## Shadows

Flat and airy. Only the stage gets weight.
`--shadow-sm` cards · `--shadow-md` hover lift · `--shadow-lg` floating product imagery · **`--shadow-stage`** the panel.

---

## Primitives (ship in `brand.css`)

| Class | What it is |
|---|---|
| **`.stage-dark`** | **The signature object** — the dark rounded panel |
| `.display` / `.display--center` + `<span class="accent">` | Hero display, sentence case, blue last line |
| `.section-title` / `.h1` / `.h3` / `.eyebrow` / `.lead` / `.muted` | Type |
| `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` + `.btn-ico` | Buttons |
| `.feature-list` / `.feature-row` | Text + hairline. No bullets, no icons |
| `.tint-panel` | The pale-blue media container |
| `.two-col-alt` / `.is-flip` | Alternating copy ↔ media |
| `.nav` `.nav-in` `.nav-logo` `.nav-mark` `.nav-right` | White minimal nav |
| `.card` / `.pill` / `.stat` / form controls | Surfaces, chips, inputs |

### Buttons
- **`.btn-primary`** — **blue pill, white text.** The signature CTA.
- **`.btn-secondary`** — near-black pill, white text — **turns blue on hover.** On the stage it inverts to a translucent white pill.
- **`.btn-ghost`** — text only.

```html
<a class="btn btn-primary" href="#"><span>Book a call</span><i class="btn-ico" aria-hidden="true"></i></a>
```

### The signature hero

```html
<header class="hero">
  <div class="container">
    <div class="stage-dark">
      <h1 class="display">Qualified leads, delivered to your WhatsApp <span class="accent">in seconds.</span></h1>
      <p class="hero-lead">…</p>
      <div class="hero-cta">…</div>
      <div data-leadly-reel></div>   <!-- the reel -->
    </div>
  </div>
</header>
```

---

## The logo

`/assets/leadly-logo.png` (dark, for the white page) and `/assets/leadly-logo-white.png` (for a stage). Never re-typeset the wordmark in Figtree — the mark is drawn, the UI is Figtree.

## Third-party chrome

The demos depict real integrations, so they reproduce real chrome: **WhatsApp** (`--wa-*`) and **Google Sheets** (`--gs-green`). These are the *only* hardcoded colours outside `brand.css`, they live in `leadly-components.css`, and they appear **only inside a device screen** — never as Leadly's own UI. WhatsApp green is not a Leadly accent.

## The reel — `/assets/leadly-reel.css` + `.js`

Real ad creatives fanned on a slow arc across the stage, with a pause control and a progress bar. It has **no background of its own** — the cards float on the panel.

Drop your creatives in by defining `window.LEADLY_REEL` **before** `leadly-reel.js` loads:

```js
window.LEADLY_REEL = [
  { img:'/assets/ads/retirement-01.jpg', kicker:'Retirement',
    line:'Are you on track to retire — or just hoping?', cta:'Free 2-min check' },
  …
];
```

Portrait images (≈4:5 or 2:3, cover-fit). Omit `img` and a placeholder gradient (`art`) is drawn, so the layout is right before the images land.

## The demos — `/assets/leadly-components.css` + `.js`

Five demos, each one a thing the product actually does, running live:
`qualifier` · `ping` · `sheet` · `winback` · `pulse`

```html
<div data-leadly-demo="ping"></div>              <!-- auto-mounts on scroll -->
<div data-leadly-demo="ping" data-manual></div>  <!-- mount by hand (tabs) -->
```

For a tabbed UI, call `window.LeadlyDemo.mount(el)` on first activation.

The old `leadly-animations.*` are **superseded**. They still ship because `/animations` and the deck load them, but nothing new should.

---

## Rules that don't bend

1. **No hardcoded values outside `brand.css`.** Colour, type, radius, spacing → tokens only.
2. **The page is white. The stage is the only dark object** — once per page, twice at the very most.
3. **Blue is the single accent**, used sparingly. Not a background. Not decoration.
4. **No gradients, no glow, no glassmorphism on the PAGE.** The white page is flat — depth is whitespace, hairlines, and the shadow under a stage.
   **On a stage, the opposite is true.** The grid, the bloom, the machined chassis, the raking glass: that texture is the point. It never leaks onto the white.
5. **Sentence case.** Nothing is set in all-caps except the 12px eyebrow.
6. **`brand.css` stays portable** — no repo-specific paths, no sibling `@import`s beyond the web-font.

---

## Migration status

| Property | On `brand.css` v3? |
|---|---|
| `/for/insurance` | ✅ rebuilt on Paper & Stage |
| `/assets/leadly-components.*` | ✅ the current demo kit |
| `/assets/leadly-animations.*` | ⚠️ superseded — still loaded by `/animations` + the deck |
| `/for/insurance/deck` | ⬜ still reads the old class names — needs a pass |
| `/for/insurance/pricing` | ⬜ needs a pass |
| `/animations`, `/brand-preview.html` | ⬜ need a pass |
| Homepage + root pages | ⬜ still the pixel-verified Framer capture |
