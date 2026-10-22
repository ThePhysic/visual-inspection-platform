# Authentic application screenshots

These are browser captures, not interface mockups. The underlying panel/component
images are [original synthetic illustrations](../../fixtures/inspections/README.md);
the predictions are explicitly simulated.

| File | What it shows |
| --- | --- |
| `inspection.png` | Three original, intentionally imperfect predictions returned by the real worker |
| `review.png` | Persisted revision 1 after real canvas move/resize/drawing, relabelling, rejection, save and refresh |
| `history.png` | The three fixture inspections, canonical thumbnails, and the saved-review indicator |

`capture.json` records capture time, source HEAD/dirty state, viewport and the
generated disposable project. A dirty source means HEAD alone does not reproduce
the capture. No screenshot has been composited, retouched or populated with
browser-invented predictions. There is no demo video yet.

Regenerate with `pnpm portfolio:capture` after installing workspace dependencies
and Playwright Chromium. It uses the production nginx/API/worker/MongoDB/Redis
stack with new disposable data. Test source is
`apps/web/container-test/portfolio.spec.ts`; the wrapper is
`infra/portfolio/capture.mjs`. Screenshot writing is opt-in; ordinary CI runs the
browser assertions without overwriting these tracked captures.
