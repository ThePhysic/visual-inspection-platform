# Simulated inspection samples

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
