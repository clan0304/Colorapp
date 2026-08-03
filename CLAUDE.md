CLAUDE.md

This file gives Claude Code context and guidance for working on this project. The project name is still undecided, so it's referred to as "PersonalColor App" as a placeholder throughout this document.

Project Overview

A personal color diagnosis + hair designer matching app for the Australian market, inspired by Korea's FACEBOARD (personal color diagnosis + KPCA-certified designer/salon directory app). Starts with a self-curated designer network, with no external certification body affiliation.

Core user flow

User takes/uploads a photo
AI runs an initial personal color diagnosis pass (4 season types: spring warm / summer cool / autumn warm / winter cool, plus subtypes)
User confirms/refines the result through 2-3 rounds of digital draping — picking between paired color swatches shown next to their photo — and the final season type combines the AI's initial read with the user's picks
Diagnosis result is rendered as a shareable card image
Matching hair designers/salons are recommended, with a way to make contact
Tech Stack
Layer	Choice	Notes
Framework	Expo (SDK 56) + React Native	Covers iOS and Android together
Styling	NativeWind	Tailwind syntax applied directly to RN
UI components	React Native Reusables	RN equivalent of shadcn/ui
Auth	Clerk (Native Third-Party Auth)	Do not use the deprecated JWT template approach
DB	Supabase (Postgres + RLS)	
Photo storage	Cloudflare R2	Auto-delete lifecycle after analysis is required (see privacy section below)
AI diagnosis	Claude API (vision)	MVP uses Haiku 4.5 or Sonnet 5, structured JSON output
Result card rendering	Creatomate	Reuses the pattern already validated on the SalonClip project
Payments (Phase 5+)	Stripe Checkout → Stripe Connect later	Starts as simple per-use payment, expands to Connect once designer booking is wired up
Async processing	Inngest	Job chain for capture → analysis → card generation. NOT wired yet — analysis still runs inline in /api/analyze.
Deployment	EAS Build/Submit	
Architecture Conventions (project-wide rules)
Soft delete only — no table is ever hard-deleted. Use a deleted_at column.
RLS uses auth.jwt()->>'sub' — not auth.uid(), since auth is via Clerk.
SECURITY DEFINER functions always specify SET search_path = public.
All monetary values are stored as integer cents (applies once Phase 5 payments are introduced).
Folder structure follows Expo Router's default convention (app/ directory-based routing).
Mandatory Error Handling Rules (절대 규칙 — non-negotiable)
These rules apply to ALL backend/API code (API routes, Inngest jobs, Supabase functions, server-side scripts). Code that violates any of them must not be submitted.
- Every error thrown from business logic is an AppError carrying a machine-readable code, an HTTP status, and optional details. Never throw raw strings or bare Error objects.
- Error categories are kept separate, each with its own code and status: validation (400), auth (401), forbidden (403), not_found (404), conflict (409), rate_limit (429), internal (500). Never collapse everything into a generic 500.
- A single global error handler maps AppError → HTTP response. No ad-hoc per-route try/catch response shaping.
- Every request gets a requestId (generated at entry, or propagated from an incoming header). It is included in every error response and every log line for that request.
- Production error responses must NEVER expose stack traces, SQL, internal error messages, API keys/secrets, or infrastructure details. Clients receive only: code, a safe user-facing message, requestId, and field-level details for validation errors.
- Every error log includes: requestId, user/tenant identifier, request path, error code, and the full stack trace. Detail belongs in logs, never in responses.
- Error-handling behavior must be covered by tests (correct status/shape per category, no internal leakage in production mode), and code is only submitted when those tests pass.
Development Phases (order matters — follow this sequence)

Build status (last updated 2026-07-31)
- Phase 1 — scripts BUILT, but the consistency test has NEVER BEEN RUN. There is no photo set yet, so the diagnosis engine is still unvalidated. This is the top open item, and several deferred decisions below are waiting on its numbers.
- Phase 2 — DONE. Creatomate templates + render pipeline (lib/card/, scripts/card/run.ts, /api/card).
- Phase 3 — DONE. Expo Router app (capture / draping / result / history / clip / sign-in), Clerk auth, Supabase schema, R2 upload with server-side delete immediately after analysis.
- Sharing surfaces — BUILT (see "Result Screen and Sharing Surfaces" below). Not validated on a real device: the clip screen needs a camera and the simulator has none.
- Phases 4-6 — not started. designers table exists but is empty; no payments; no metrics instrumentation.
- The Mandatory Error Handling Rules below are implemented in lib/server/errors.ts (AppError + withErrorHandler + requestId) and covered by tests/errors.test.ts. Note that the Phase 1 CLI scripts under scripts/ deliberately do NOT follow them — they are not request/response code, so they use usage() + console.error + process.exit, matching each other.
- Tests: npm test (node:test), 38 passing. Typecheck: npx tsc --noEmit. There is no lint script, and the repo is NOT prettier-clean despite .prettierrc — match the style of the file you are editing rather than reformatting it.
- Native builds: the project is CNG — app.json is the source of truth and there is no checked-in ios/ or android/. Do not commit generated native dirs; if one exists, EAS skips prebuild and silently ignores later app.json changes. A local `expo run:ios` CANNOT build here: SDK 56 needs Xcode 26.4, which needs macOS Tahoe 26.2, and this machine is on macOS 14. Use EAS (eas.json has development/preview profiles, both `ios.simulator: true`). A real-device build needs those profiles without the simulator flag plus Apple provisioning.

Phase 1 — Validate the diagnosis engine (no app yet, scripts only)
Build a pipeline that sends a cropped face image + a color-theory prompt (undertone / depth / chroma axes) to a vision LLM and gets back structured JSON (initial season type guess, subtype, confidence, reasoning — and, when borderline, the two closest candidate season types)
Design the digital draping layer: for the initial guess (or a borderline pair of candidates), generate 2-3 rounds of paired color swatches drawn from the colors that differentiate those candidates, for the user to pick between
Define the combination logic for merging the LLM's initial guess with the user's swatch picks into a final season type (e.g., consistent disagreement from the user shifts the result; agreement just raises confidence)
Test consistency using 5-10 photos of the same person under different lighting/angles, run through the full hybrid pipeline (LLM pass + draping rounds) — check whether the final combined result stays stable even when the LLM's photo-only read varies
This phase needs no app code — a Node/Python script plus API calls is enough
Phase 2 — Result card
Build Creatomate templates per season type (including Instagram Story size)
Get the full diagnosis → card generation pipeline working end to end (first demoable milestone)
Phase 3 — App shell
Scaffold the Expo project, set up NativeWind + React Native Reusables
Camera capture screen: expo-camera + face-alignment guide overlay + basic brightness check
Draping confirmation screens: 2-3 rounds of paired color swatches shown next to the user's photo, collecting their picks
Build out the Supabase schema (see data model below)
Clerk auth — the diagnosis itself should be usable without logging in; only prompt login when saving results or contacting a designer
Set up R2 upload + auto-delete lifecycle policy once analysis is complete
Phase 4 — Designer directory (start thin)
Start with a small, self-curated list of designers/salons, no external certification body
Simple matching between season-type tags and designer specialty tags
Add Supabase's PostGIS extension later if location-based search becomes necessary
Phase 5 — Monetization
Small per-diagnosis payment (Stripe Checkout)
Expand to Stripe Connect once designer booking + a commission structure are needed
Phase 6 — Measurement

Track just three core metrics: diagnosis completion rate / result share rate / designer contact conversion rate

Data Model (implemented — supabase/migrations/ is the source of truth)

The schema lives in supabase/migrations/0001_init.sql and 0002_allow_skip.sql, and has moved past the original draft. Read the DDL before changing anything; the notes below are only the parts that are NOT obvious from reading it.

- Write model: diagnoses / drape_responses / photos are written ONLY by the server (service role), through persist_completed_diagnosis(), which persists a finished diagnosis and its draping rounds atomically and idempotently (re-submitting the same pre-generated id is a no-op). Clients never insert results, and the server recomputes the final season before persisting. This is the tamper-proofing that Phase 5's paid diagnoses depend on — do not add a client write path.
- Guests: diagnoses.user_id is nullable. After login a guest row is attached via claim_diagnosis(). For the MVP the bare diagnosis UUID is the claim capability; before Phase 5 it must become a hashed one-time token with an expiry (TODO recorded in 0001_init.sql).
- diagnoses carries more than the draft did: llm_runner_up_season_type, is_borderline, final_confidence, combination_method — plus CHECK constraints pinning subtype to its season and forcing draping_shifted to land on the runner-up. The DB is the last line of defence behind combine(), not the only one.
- drape_responses.user_choice is a | b | skip. Skips are recorded (a high skip rate flags a bad swatch pair for palette tuning) but count as no vote in combine().
- photos rows are service-role only and hold just the R2 key + expiry. The object is deleted in /api/analyze the moment analysis finishes, success or failure; the bucket lifecycle rule is the backstop, not the primary mechanism.
- designers exists with a GIN index on specialties, but is empty — Phase 4 has not started.
- final_confidence is still written and still computed, but is NOT displayed anywhere (see "Confidence is a band, not a percentage"). history.tsx deliberately does not select it. Keep storing it — it is the raw material the consistency test will calibrate.
Result Screen and Sharing Surfaces

Three distinct surfaces, each with a different job. They look similar and are easy to confuse when editing.

- components/drape-compare.tsx ("SEE IT ON YOUR SKIN") — the DIAGNOSTIC one. The photo already taken, fabric at the neck, a draggable divider wiping between the season's signature colour and its sharpest avoid colour. The face is never split down the middle: that would compare one cheek under one colour against the other cheek under the other, and faces are neither symmetric nor evenly lit. Clipping is done with two counter-translating transforms rather than an animated width, because animating width re-runs Yoga layout on every touch frame and the wipe visibly stutters. It also lives inside a ScrollView, so its PanResponder claims only on horizontal intent and refuses termination — without both, the two fight over every drag.
- app/clip.tsx ("MAKE A CLIP") — the PROMOTIONAL one, and the only one meant to be filmed. Live front camera, a fabric-shaped colour band swapping under the chin on a beat, the way a consultant works through drapes. Nothing is captured, uploaded or stored — it is a viewfinder with an overlay, and the user's own screen recording is the artefact. Flow is ready → 3-2-1 countdown → run; the countdown is NOT automatic on entry because starting the OS screen recorder takes several taps and a countdown that fires first is worse than none. A neutral grey "cape" shows during ready so the user can line their chin up without seeing a colour early.
- The Creatomate card (/api/card) — metadata only, never the face, so it is safe to keep and share long-term.

An earlier fourth surface slid a masked photo across two fixed colour fields. It was deleted. Compositing a still onto a colour needs the face cut out of its background, and with no person segmentation available the feathered oval standing in for a cutout read as a ghost. The live camera version has nothing to composite, which is why it replaced it — do not reintroduce the photo-compositing approach without real segmentation.

Gotcha worth keeping: react-native-svg does NOT extend a gradient's first stop back to offset 0 the way the SVG spec says. A radial-gradient mask whose first stop is at 0.8 leaves the entire core transparent, so only a thin ring renders. Always write an explicit offset-0 stop.

The clip run is warm colours then cool colours (lib/diagnosis/recommendations.ts: TEMPERATURE_DRAPES, temperatureRun), not the season palette. Temperature is chosen over season because undertone is the axis the diagnosis turns on and the only one a stranger scrolling past can read — "warm vs cool" lands, "terracotta vs icy pink" does not. The cost is that depth and chroma drop out, so the clip communicates "cool" rather than "summer"; the season name stamped on the frame carries that. The run always OPENS on the opposite temperature and CLOSES on the user's own — the payload is the result, so it should end on the confirmation, and a shot where you look good is the one that actually gets posted. Tests pin this ordering.

Letting users hand-pick the colours was considered and rejected: it puts a configuration screen in front of the fun, and the people least able to choose colours are exactly the ones using the app. Preset sets ("my palette", "best vs worst") are a reasonable v2 because they multiply the number of clips one person can make, but they are deferred until there is evidence anyone makes even one.

Attribution: components/brand-mark.tsx is the single stamp on everything postable. BRAND_NAME lives in lib/card/templates.ts so the Creatomate card shares it — changing that one string updates card, clip and stills together. BRAND_LOGO and BRAND_HANDLE are deliberate empty slots. A logo never replaces the wordmark (someone who sees the clip searches for a name, not a shape), and the handle stays null until the accounts exist rather than shipping one that 404s. Callers must keep the mark inside the crop-safe band — a phone screen is roughly 9:19.5 but Reels is 9:16, so about 9% off each end is cropped on upload, and a mark that gets cut off is the same as no mark.

Confidence is a band, not a percentage

The result hero and the card used to read "85% match". They now read "Strong match" / "Good match" / "Close call" via confidenceBand() in lib/diagnosis/combine.ts. The number was not a measurement:
- Nothing calibrates it. The Phase 1 consistency test has never run, so 0.55, 0.1, 0.08 and 0.95 in combine() are all hand-picked.
- It is not one scale. draping_shifted computes it from the vote margin alone and ignores the model's own confidence; llm_confirmed starts from that confidence and adds to it. Same number on screen, two different meanings.
- With three hardcoded rounds, draping_shifted could only ever emit 0.65, 0.75 or 0.85 — the percent sign advertised precision that was never there.

The bands are read off what actually happened instead: whether the photo read and the picks agreed, and by how much. Two rules are load-bearing and tested — a result that draping OVERRODE is never "strong" (the two signals disagreed by definition), and a photo read the model flagged is_borderline is never "strong" however lopsided the vote. Exact vote counts stay visible in the result details, so nothing is hidden, only un-dressed-up. Revisit once the consistency test gives the numbers meaning.

/api/card takes the band KEY and maps it to copy server-side, so a caller cannot stamp arbitrary text onto a shareable card.

Known dead code: the 0.9 ceiling in combine.ts's draping_shifted clamp is unreachable while rounds are fixed at 3 (max margin 3 → 0.85).
AI Diagnosis Pipeline Notes
Hybrid two-stage diagnosis: (1) a vision LLM gives an initial season-type read from the photo alone, (2) the user then confirms/refines it through 2-3 rounds of digital draping (picking between paired color swatches shown next to their photo). The final season type combines both signals — it is never based on the photo analysis alone.
This hybrid design is also a deliberate differentiation choice, not just a UX nicety: known Korean patents on automated personal color diagnosis (facial-region RGB extraction compared against a reference library; hexagonal color-model matching) claim purely photo-analysis-based methods. Layering user-driven interactive preference selection on top of the LLM's initial read is a materially different technical approach from those specific claims.
Original photos are deleted immediately after analysis completes (R2 lifecycle policy). Only diagnosis result metadata (season type, extracted color values, draping choices) is kept long-term — never the original face photo.
The line this draws is "does it contain a face": no face → the server may keep it (the Creatomate card does), face → device only. That rule settled two decisions. Consent-gated server retention of a face composite was considered and rejected — the delete in /api/analyze is unconditional (a finally block, success or failure), and that lack of a branch is doing real work as a safety property; a "Save" tap is also weak consent for storing a face image in the Australian market. And react-native-view-shot + expo-media-library were added for an on-device still export, then removed with the feature, along with the NSPhotoLibraryAddUsageDescription and Android media permissions prebuild had pulled in with them. If a consent-gated retention path is ever built, the thing that justifies it is photos for validating the diagnosis engine, not a promo image — and it needs its own clearly-worded toggle, not a Save button.
Specify color-theory criteria (warm/cool, depth, chroma) in the prompt and include few-shot examples to keep the LLM's initial read consistent.
If volume grows, consider prompt caching for the fixed, repeated part of the prompt (not needed at the current stage — per-diagnosis API cost is already in the 1-2 cent range).
ONE photo per diagnosis (decided 2026-07-29). A multi-photo ensemble (2-3 shots, majority vote) was considered and deliberately deferred: requiring several photos before the user sees any result attacks diagnosis completion rate, one of the three Phase 6 metrics, and the draping rounds already exist to absorb single-photo variance. Reversing it later is cheap — combine() takes one Analysis, so a merge step slots in ahead of it. Revisit only if the consistency test reports hybrid stability below ~85%, and note that the fallback of record at that point is the Lab-space two-stage classifier, not an ensemble.
The capture screen defaults to the FRONT camera on purpose, despite rear cameras being more color-accurate. Every item in the shot guide — oval alignment, shadow on the face, hair off the forehead, top color reflecting onto the neck — can only be verified live on the front camera, and bad framing or backlight damages the read far more than softer tone mapping does. A front-camera bias is also systematic across all users and therefore correctable in the prompt; a random front/rear mix is not. Do not "fix" this default to 'back', and do not write copy recommending the rear camera.
Shot guide (components/shot-guide.tsx): a bottom sheet over the live camera, shown every time the capture screen opens, and re-opened carrying the model's own image_quality.notes when a shot comes back with lighting_ok=false or face_visible=false. Input quality dominates everything downstream — a warm indoor bulb alone can flip a cool read warm, and the prompt's cast correction only goes so far — so coaching the shot is the cheapest accuracy available. Camera controls are disabled while it is open, because a plain View overlay does not claim touches in React Native.

CameraView takes NO children. expo-camera warns that children lead to inconsistent behaviour or crashes, and capture.tsx used to nest the alignment guide and the shutter controls inside it. Everything drawn over a preview is now an absolutely positioned sibling with the camera on StyleSheet.absoluteFill — follow that pattern in any new camera screen (app/clip.tsx does). The disabled-while-guide-is-open workaround above is unrelated and still needed.
Phase 1 Consistency Test — how to read it (it will quietly lie in three ways)
Always pass --truth. Without it the "true" season defaults to the majority LLM read (consistency.ts), so the simulated user agrees with whatever the model said most often and stability is inflated by circular reasoning.
Only feed it photos of ONE person. Stability is the share of photos agreeing with the modal season, which is meaningless across different people — and worse, if the model collapses everyone into one season it reports 100%, peaking exactly when the model is most broken.
Treat the number as an optimistic ceiling. simulatePicks() models a user who always picks their own season's swatch; real users are noisier and skip rounds. Use ~85% as the pass mark, not the script's built-in 80%.
Coverage/bias testing — do different people spread across seasons, does confidence drop systematically for deeper skin tones — is a DIFFERENT question needing a different harness, which does not exist yet. lib/diagnosis/color.ts (CIE L* from a hex) was added as its first piece. It now has a consumer: normalizeHex() was split out of lightness() and is what result-details.tsx runs observed_colors through, since the model writes those hexes free-form (bare, lowercase, or an empty string for a region it could not read) and a raw one reaching a style prop breaks the view.
Compliance / Privacy Notes
Treat face photos as sensitive data — delete immediately after analysis, minimize any long-term retention.
The word "diagnosis" could be read as a medical claim during app store review — consider softer wording like "analysis" or "consultation" instead.
Still Undecided
Project/app name — now blocking, not cosmetic. It is the watermark on every clip and card, and user-generated sharing only converts if a viewer knows what to search for. It also carries a constraint: the name has to be FINDABLE. A generic phrase gets buried in app store results, and a watermark someone cannot successfully search is worth nothing.
Pricing model (per-diagnosis fee vs. free + designer referral commission)
Low-confidence retake threshold — capture currently warns on lighting_ok=false but accepts any confidence value. Whether to force a retake below some floor is deliberately unanswered until the consistency test produces data; a bad input silently becoming a bad result is the risk being weighed against friction. Same unvalidated number that the confidence bands stopped displaying — decide both when the test lands.
Whether the clip screen should light the face. The colour band sits next to the face on screen; a real fabric drape reflects its colour onto the skin, which is the actual mechanism. Raising screen brightness with a larger colour area in a dim room would make the effect physical rather than only perceptual (simultaneous contrast). Deliberately inverse to the capture screen's rules — coloured light on the face is a defect there and the goal here — which is safe only because the clip presents a result and never measures one. Waiting on real-device testing.
Preset clip sets (see "Result Screen and Sharing Surfaces") — deferred until clips are proven to get made at all.
Designer/Salon Network Sourcing

No external certification body affiliation — this is settled. The initial designer/salon network is sourced and curated directly by the founder (not part of the dev scope).