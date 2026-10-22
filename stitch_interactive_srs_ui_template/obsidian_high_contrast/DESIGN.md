---
name: Obsidian High-Contrast
colors:
  surface: '#0c1324'
  surface-dim: '#0c1324'
  surface-bright: '#33394c'
  surface-container-lowest: '#070d1f'
  surface-container-low: '#151b2d'
  surface-container: '#191f31'
  surface-container-high: '#23293c'
  surface-container-highest: '#2e3447'
  on-surface: '#dce1fb'
  on-surface-variant: '#c6c5d5'
  inverse-surface: '#dce1fb'
  inverse-on-surface: '#2a3043'
  outline: '#908f9e'
  outline-variant: '#454653'
  surface-tint: '#bdc2ff'
  primary: '#bdc2ff'
  on-primary: '#131e8c'
  primary-container: '#818cf8'
  on-primary-container: '#101b8a'
  inverse-primary: '#4953bc'
  secondary: '#5de6ff'
  on-secondary: '#00363e'
  secondary-container: '#00cbe6'
  on-secondary-container: '#00515d'
  tertiary: '#c4c7c9'
  on-tertiary: '#2d3133'
  tertiary-container: '#939698'
  on-tertiary-container: '#2b2f30'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e0e0ff'
  primary-fixed-dim: '#bdc2ff'
  on-primary-fixed: '#000767'
  on-primary-fixed-variant: '#2f3aa3'
  secondary-fixed: '#a2eeff'
  secondary-fixed-dim: '#2fd9f4'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5a'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#0c1324'
  on-background: '#dce1fb'
  surface-variant: '#2e3447'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
  container-max: 1280px
---

## Brand & Style
The design system adopts a high-contrast, technical aesthetic that prioritizes extreme legibility and structural clarity. It is designed for environments requiring deep focus, such as developer tools, financial dashboards, or high-end SaaS applications. 

The style is a blend of **Minimalism** and **Modern Corporate**, utilizing heavy "obsidian" blacks to create a sense of infinite depth, contrasted sharply against vivid, luminous accents. The emotional response is one of precision, authority, and cutting-edge reliability. Visual hierarchy is maintained through strict monochromatic layering and sudden bursts of saturated neon color for interactive elements.

## Colors
This system utilizes a "Deep Obsidian" foundation to maximize contrast and reduce eye strain in low-light environments. 

- **Primary & Secondary:** "Electric Indigo" (#818cf8) and "Vivid Cyan" (#22d3ee) act as high-luminance beacons for actions and status.
- **Surface Strategy:** The base background uses Slate-950 (#020617). Containers step up to Slate-900 (#0f172a) to provide subtle differentiation without losing the dark aesthetic.
- **Typography:** Primary text uses Slate-50 (#f8fafc) for near-maximum contrast, while secondary text drops to Slate-400 to maintain hierarchy.
- **Dividers:** All borders must be visible; use Slate-800 for general containment and Slate-700 for active states or high-emphasis separators.

## Typography
The typography strategy centers on technical precision. **Geist** is used for headlines to provide a modern, engineered feel with tight tracking. **Inter** handles the heavy lifting for body copy, ensuring maximum readability at small scales. **JetBrains Mono** is utilized for labels, metadata, and code snippets to reinforce the technical nature of the system.

On mobile, headline sizes are aggressively scaled down to maintain information density. Ensure a 4:1 contrast ratio is maintained even for secondary text styles.

## Layout & Spacing
The system employs a **Fluid Grid** with a strict 4px baseline rhythm. 

- **Desktop:** 12-column grid with 24px gutters. Fixed margins of 40px until the max-width of 1280px is reached.
- **Tablet:** 8-column grid with 20px gutters. 
- **Mobile:** 4-column grid with 16px gutters and 16px side margins.

Spacing between functional groups should be generous (32px+) to prevent the high-contrast elements from feeling cluttered. Use strict alignment to the grid to honor the "Obsidian" brand's structured personality.

## Elevation & Depth
In this high-contrast dark theme, depth is communicated through **Tonal Layering** and **High-Contrast Outlines** rather than traditional soft shadows.

1.  **Level 0 (Base):** #020617 (Slate-950).
2.  **Level 1 (Card/Container):** #0f172a (Slate-900) with a 1px border of #1e293b (Slate-800).
3.  **Level 2 (Popovers/Modals):** #1e293b (Slate-800) with a 1px border of #334155 (Slate-700). 

Avoid using blurs or glows for elevation unless they are used to highlight a primary action button (e.g., a subtle 8px Electric Indigo outer glow). Use "Inner Strokes" on buttons to give them a tactile, inset feel against the dark backgrounds.

## Shapes
The shape language is **Soft** but leans toward the architectural. Small border radii (4px to 8px) are used to keep the UI feeling professional and precise without the harshness of 0px corners. This slight rounding prevents the high-contrast borders from feeling too "sharp" on high-DPI displays.

## Components
- **Buttons:** Primary buttons use a solid Electric Indigo (#818cf8) fill with black text for maximum punch. Secondary buttons use a Slate-800 background with a Slate-700 border and white text.
- **Inputs:** Fields must have a Slate-950 background and a clear Slate-800 border. Upon focus, the border transitions to Vivid Cyan (#22d3ee) with a subtle 2px outer ring.
- **Chips:** Small, high-contrast badges using Slate-800 backgrounds and mono-spaced JetBrains Mono text.
- **Lists:** Separated by 1px dividers using Slate-800. Hover states should use a subtle tint of Slate-800/50 to highlight the row without overwhelming the content.
- **Cards:** Defined by a Slate-900 background and a 1px Slate-800 border. Titles should always be Slate-50 (High-brightness white).
- **Status Indicators:** Use Vivid Cyan for "Info/Active," Electric Indigo for "Primary/Action," and traditional high-saturation Red/Green for error/success, but always framed in Slate-900 containers to maintain the theme's integrity.