---
name: Kinetics brand palette for AI Innovation Circle
description: The brand colors/logo used when theming the app to Kinetics Group
---

# Kinetics Group branding

The AI Innovation Circle app is themed to Kinetics Group (kinetics.co.nz).

**Palette (HSL, as used in index.css `H S% L%` token format):**
- Primary green: `126 55% 40%` (≈ #2E9E3A) — buttons, active nav, focus rings, chart-1
- Lime accent: `87 70% 50%` (≈ #76BC21) — secondary chart / accent
- Supporting chart greens: `150 45% 35%`, `100 45% 62%`, `130 28% 58%`

**Logo:** the official Kinetics Group mark (green chevron + "KINETICS GROUP"
wordmark) lives at `src/assets/kinetics-logo.png`; `src/components/KineticsLogo.tsx`
renders it via `<img>`. The source was extracted from the brand docx in
`attached_assets/` (unzip the .docx, logo is in `word/media/image1.png`), cropped
to drop the OutSource/CloudSource sub-brand row, and had white made transparent
(ImageMagick `convert`/`magick` is available in this env; python/PIL is NOT).
Do not re-add a separate "Kinetics" text wordmark next to the logo — the image
already contains it. "AI Innovation Circle" is the product sub-label.

**Why:** Matches Kinetics Group's website (green primary + lime accent + chevron mark).

**How to apply:** Keep semantic status colors (e.g. blue "In Progress" goal badges)
distinct — they are NOT brand colors and should stay as-is so statuses remain
readable against the green theme.
