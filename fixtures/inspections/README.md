# Simulated inspection samples

## Portfolio illustrations

These three new PNGs and their SVG sources were **originally drawn in repository
code** for this project. `generate.mjs` constructs geometric SVGs and renders them
with the pinned Sharp dependency. No photographs, stock assets, downloaded
textures, fonts, third-party graphics or AI-generated artwork were used. They are
synthetic illustrations of inspection scenarios, not real manufacturing evidence.
No separate license grant for the repository is created by these provenance notes.

| Fixture | Dimensions / bytes | Curated simulated output |
| --- | --- | --- |
| [machined-panel.png](machined-panel.png) | 1200×800 / 84,355 | Three boxes: main scratch intentionally labelled Edge defect, actual edge irregularity, top-left bolt intentionally flagged Surface mark |
| [edge-component.png](edge-component.png) | 800×1100 / 47,475 | One Edge defect around the illustrated right-edge notch |
| [clean-panel.png](clean-panel.png) | 1200×800 / 76,464 | Zero detections, a valid completed result |

The marked panel deliberately leaves the two short lower-right strokes undetected
so the user can add a manual Surface mark. Relabel the main scratch to Surface
mark; reject the bolt false positive. This is a curated editing exercise, not
defect recognition. All scores are invented deterministic demonstration values.

Canonical-pixel region map (divide x/width by image width and y/height by image
height for normalized boxes):

| Image / annotation | x | y | width | height | Simulated confidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| Marked panel 1: main scratch, wrong class | 430 | 300 | 290 | 125 | 0.86 |
| Marked panel 2: edge irregularity | 1000 | 390 | 90 | 130 | 0.91 |
| Marked panel 3: bolt false positive | 185 | 145 | 70 | 70 | 0.62 |
| Portrait component: edge irregularity | 550 | 430 | 95 | 150 | 0.89 |
| Suggested manual panel mark (no prediction/confidence) | 780 | 520 | 84 | 56 | none |

Canonical SHA-256 values:

```text
machined-panel.png 3742c0d92581fab163671ec34b267f27b4c4097b94bb459adb4285bb4cf328a3
edge-component.png cc8c6adb5b9ee5a7f2cb5b0ed96cb0d0a7ffe38259187035435b1eae6a4accd9
clean-panel.png    5db9cbe881289d08905a6cbb4338228751fc5ce69bd899df27c9af3b4d420f77
```

Upload the **PNG**, not the SVG (SVG uploads are unsupported). PNG canonicalization
preserves the recorded checksum; integration tests verify this through actual
ingestion and queue execution. Recognition uses decoded canonical bytes, never
filenames. Re-encoding/rescaling externally can change the checksum and select
the generic deterministic fallback instead.

To regenerate after `pnpm install --frozen-lockfile`, run
`node fixtures/inspections/generate.mjs` from the repository root. It writes only
the three new SVG/PNG pairs. Rendering-library changes may change bytes; compare
hashes and review both image and curated region map before updating them.

## Original regression and benchmark fixtures

These synthetic 64×64 PNGs demonstrate software behavior, not model accuracy.
Upload them through `/api/v1/assets` before submitting an inspection.

- `panel.png`: a colored rectangle at pixel `(12,16)`, size `20×12`. Mock v1
  emits one simulated “Surface mark” with confidence `0.94` and normalized box
  `{x:0.1875,y:0.25,width:0.3125,height:0.1875}`.
- `empty.png`: a blank image. Mock v1 emits a valid empty detection list.

The images use the same PNG canonical encoding as ingestion. Their canonical
SHA-256 checksums are recorded in `packages/backend/src/provider.ts`; integration
tests verify these outputs after upload. Arbitrary JPEG/PNG images receive a
content-seeded fallback with zero, one, or two simulated detections from the
versioned `mock-v1` label vocabulary.
