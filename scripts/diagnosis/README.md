# Phase 1 — Diagnosis Engine Validation

Scripts-only validation of the hybrid personal color diagnosis pipeline (no app code), per CLAUDE.md Phase 1:

1. **LLM initial read** — a cropped face photo + color-theory prompt (undertone / depth / chroma axes) goes to Claude vision, which returns structured JSON (season, subtype, confidence, runner-up candidate, reasoning).
2. **Digital draping** — 2–3 rounds of paired color swatches drawn from the colors that differentiate the two candidate seasons; the user picks one per round.
3. **Combination logic** — agreement raises confidence; consistent disagreement shifts the result to the runner-up (see `combine.ts`).

## Setup

Add your API key to `.env` at the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Single photo (interactive draping in the terminal)

```
npm run diagnose -- path/to/face.jpg
npm run diagnose -- path/to/face.jpg --model claude-haiku-4-5   # cost comparison
npm run diagnose -- path/to/face.jpg --auto spring_warm          # simulate the user's picks
```

## Consistency test (CLAUDE.md Phase 1 requirement)

Put 5–10 photos of the **same person** under different lighting/angles into one directory:

```
npm run diagnose:consistency -- path/to/photos --truth autumn_warm
```

Reports per-photo initial vs final reads and a stability score for each. The point of the test: even when the LLM's photo-only read varies with lighting, the hybrid (LLM + draping) result should stay stable. If the final stability is below ~80%, move to the two-stage approach (facial-region pixel extraction + Lab-space rule-based classifier).

## Files

| File | Role |
|---|---|
| `types.ts` | Season/subtype taxonomy, zod schema for the LLM's structured output |
| `prompt.ts` | Color-theory system prompt with few-shot examples |
| `analyze.ts` | Claude vision call via `messages.parse()` (structured outputs) |
| `palette.ts` | Differentiating swatch pairs for all 6 season-pair combinations |
| `draping.ts` | Interactive terminal draping + simulated user for batch tests |
| `combine.ts` | LLM read + draping picks → final season/subtype/confidence |
| `run.ts` | Full pipeline CLI for one photo |
| `consistency.ts` | Batch runner + stability report |

## Notes

- Default model is `claude-sonnet-5` (per CLAUDE.md: Haiku 4.5 or Sonnet 5 for MVP). Use `--model claude-haiku-4-5` to compare cost/quality.
- Photos should be cropped to the face; keep them ≲1024px on the long edge to control token cost.
- Subtype taxonomy is the 8-type simplification (2 per season); can expand to the 12-tone system later.
- Photos are read locally and sent only to the Claude API; nothing is stored.
