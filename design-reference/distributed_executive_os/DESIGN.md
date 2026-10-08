---
name: Distributed Executive OS
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8d90a0'
  outline-variant: '#434655'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#0053db'
  secondary: '#89ceff'
  on-secondary: '#00344d'
  secondary-container: '#00a2e6'
  on-secondary-container: '#00344e'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#007d55'
  on-tertiary-container: '#bdffdb'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 3rem
    fontWeight: '600'
    lineHeight: 3.5rem
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: '0'
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0.005em
  label-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-xs:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system serves high-velocity distributed teams and enterprise leaders who require real-time visibility into asynchronous operations. The brand personality is precise, authoritative, quiet, and hyper-reliable. It rejects playful consumer ornamentation in favor of an engineered executive aesthetic reminiscent of aviation cockpits and institutional intelligence dashboards.

The visual direction combines high-contrast Modern Corporate typography with structural architectural borders, subtle atmospheric glows, and precise spatial grouping. Interfaces must inspire confidence during high-stakes distributed decision-making, offering effortless legibility, unambiguous hierarchy, and low-latency cognitive processing across global time zones.

## Colors

The system uses a calibrated dark-first baseline built on cold slates. Light backgrounds introduce cognitive fatigue in data-dense operations; dark-mode slates minimize eye strain while highlighting vibrant, functional signals.

- **Foundations**: Canvas sits on `#0f172a` (Slate 900) with surface cards elevated at `#1e293b` (Slate 800) and elevated dialogs/overlays at `#334155` (Slate 700). Light mode transitions cleanly using `#ffffff` for cards and `#f8fafc` (Slate 50) through `#e2e8f0` (Slate 200) for structural framing.
- **Accents**: Primary actions leverage `#2563eb` (Electric Blue) for focal weight, paired with `#0ea5e9` (Sky Cyan) for interactive metrics, sub-navigations, and progress trajectories.
- **Operational Signals**: Semantic indicators must strictly enforce single-meaning communication:
  - Healthy/Active: Emerald `#10b981`
  - Warning/Degraded: Amber `#f59e0b`
  - Alert/Incident: Rose `#ef4444`
- **Atmospheric Accents**: Subtle contextual radial glows (`rgba(37, 99, 235, 0.12)` or `rgba(14, 165, 233, 0.08)`) originate exclusively behind focal key performance metrics and primary canvas modules.

## Typography

The type system prioritizes high-density vertical alignment, crisp geometry, and maximum tabular legibility using Geist across all hierarchy tiers.

- **Tabular Figures**: Numeric statistics, clock cycles, timestamps, and currency elements must enforce monospaced or tabular numerical features (`font-variant-numeric: tabular-nums`).
- **Headlines**: Headlines use tighter letter spacing to create high visual density without sacrificing clarity.
- **Labels & Micro-copy**: Sub-labels, table headers, and badges use strict semi-bold or medium weights with generous tracking to maintain legibility when rendered in muted secondary text tones.

## Layout & Spacing

The foundation utilizes a 12-column fluid grid system pinned to a maximum canvas width of `1600px`. Spacing relies strictly on an 8-point harmonic scale, downscaled to 4-point increments for atomic layout gaps.

- **Breakpoints & Layout Behavior**:
  - **Desktop (1024px+)**: 12-column structure with `gutter` (1.5rem), `margin` (2rem). Complex information matrices stack side-by-side with split workspace docks.
  - **Tablet (768px – 1023px)**: 8-column layout with `gutter-sm` (1rem), collapsing contextual side panels into sliding bottom-sheets or flyout drawers.
  - **Mobile (320px – 767px)**: 4-column layout with `margin-sm` (1rem), full-width vertical component stacks, and sticky compact navigational headers.
- **Element Clumping**: Information cards group related properties using `space-xs` and `space-sm`. Macro sections separate through `space-lg` and `space-xl` to prevent claustrophobic density.

## Elevation & Depth

Visual hierarchy combines low-contrast hairline borders, deliberate surface level shifting, and deep ambient shadows:

- **Border Architecture**: Surfaces maintain a sharp `1px` border using `#334155` (Slate 700) in dark mode and `#e2e8f0` (Slate 200) in light mode. This gives distinct structural boundaries without relying heavily on dropshadows.
- **Layer Stacking**:
  - **Level 0 (Canvas)**: Base background `#0f172a`.
  - **Level 1 (Card/Container)**: Surface `#1e293b` with a hairline stroke and subtle bottom-weighted ambient shadow (`0 4px 20px -2px rgba(0, 0, 0, 0.4)`).
  - **Level 2 (Popovers / Drawers / Menus)**: Surface `#334155` featuring elevated diffusion (`0 12px 32px -4px rgba(0, 0, 0, 0.6)`), ringed with a `1px` translucent edge highlight (`rgba(255, 255, 255, 0.08)`).
- **Luminescence & Glows**: Active and focused states receive a radial background blur: `0 0 24px -4px rgba(37, 99, 235, 0.25)`.

## Shapes

The design system maintains a structured, refined "Soft" geometry (`roundedness: 1`). Interactive components like cards and text inputs feature `0.25rem` (4px) to `0.5rem` (8px) corner radii to preserve structural discipline and enterprise rigor.

Exceptions are made solely for status indicators, operational pills, and presence avatars, which utilize fully rounded pill contours (`9999px`) to instantly stand out from rectangular content boundaries.

## Components

### Buttons
- **Primary**: Solid Electric Blue (`#2563eb`), white typography, `0.25rem` radius, subtle top-edge bevel via `inset 0 1px 0 rgba(255,255,255,0.2)`. On hover, transitions to `#1d4ed8` with a restrained blue ambient spread.
- **Secondary**: Slate 800 background (`#1e293b`), hairline outline (`#334155`), slate-100 text. Hover activates `#334155`.
- **Ghost/Tertiary**: Transparent surface, slate-300 text, transforming to `rgba(255, 255, 255, 0.05)` on hover.
- **Touch Sizing**: Minimum interactive height of `40px` on desktop; automatically scales to `44px` on mobile viewports.

### Cards & Panels
- Constructed on `#1e293b` with a crisp `1px` border of `#334155`.
- Internal card padding strictly enforces `space-md` or `space-lg`.
- Metric summary cards include a top-right slot for live status pill indicators and subtle background radial gradients under metric values.

### Status Pills & Badges
- Strict pill architecture (`border-radius: 9999px`) with condensed `label-xs` typography.
- Built using tinted alpha backgrounds paired with high-contrast text and a left-aligned `6px` pulsating indicator dot:
  - **Healthy**: `bg-[rgba(16,185,129,0.12)] text-[#10b981] border border-[rgba(16,185,129,0.25)]`
  - **Warning**: `bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border border-[rgba(245,158,11,0.25)]`
  - **Alert**: `bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[rgba(239,68,68,0.25)]`

### Form Controls & Inputs
- Text inputs and dropdown triggers feature a `#0f172a` canvas fill, inset border `#334155`, and `0.25rem` corner radius.
- Height: `40px` on desktop, `44px` on mobile devices.
- Focused state applies a high-contrast Electric Blue border with an outer ring glow: `0 0 0 3px rgba(37, 99, 235, 0.25)`.
- Checkboxes and radio targets measure `16px` desktop / `20px` mobile, utilizing Electric Blue for checked states.

### Lists & Data Tables
- Row zebra striping is replaced with minimal hairline divider strokes (`#334155`).
- Row hover states reveal an instantaneous slate-highlight `rgba(255, 255, 255, 0.03)`.
- Table header cells adopt `label-xs` tracking with uppercase treatments and fixed sorting indicators.

### Additional SaaS Elements
- **Presence Avatars**: Stacked circular user avatars with a bottom-right green ping dot representing active timezone presence.
- **Async Breadcrumbs**: Thin monospaced navigational trails displaying system state and current geographic latency indicators.