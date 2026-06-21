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

**Logo:** two-tone left-pointing double chevron (lime outer + dark-green inner),
implemented as inline SVG in `src/components/KineticsLogo.tsx`. Wordmark is
"Kinetics" with "AI Innovation Circle" as the product sub-label.

**Why:** Matches Kinetics Group's website (green primary + lime accent + chevron mark).

**How to apply:** Keep semantic status colors (e.g. blue "In Progress" goal badges)
distinct — they are NOT brand colors and should stay as-is so statuses remain
readable against the green theme.
