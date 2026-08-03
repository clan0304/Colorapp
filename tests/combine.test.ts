import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combine, confidenceBand } from '../lib/diagnosis/combine';
import { AnalysisSchema, type DrapePick } from '../lib/diagnosis/types';

const analysis = AnalysisSchema.parse({
  image_quality: { face_visible: true, lighting_ok: true, notes: '' },
  undertone: 'warm',
  depth: 'medium',
  chroma: 'clear',
  initial_season: 'spring_warm',
  runner_up_season: 'autumn_warm',
  subtype: 'bright',
  confidence: 0.7,
  is_borderline: true,
  observed_colors: { skin_hex: '#E8C39E', hair_hex: '#5C4033', eye_hex: '#5C4033' },
  reasoning: 'test',
});

const pick = (round: number, season: 'spring_warm' | 'autumn_warm' | null): DrapePick => ({
  round,
  choice: season === null ? 'skip' : 'a',
  picked_season: season,
});

test('all rounds skipped → LLM read holds with original confidence', () => {
  const result = combine(analysis, [pick(1, null), pick(2, null), pick(3, null)]);
  assert.equal(result.final_season, 'spring_warm');
  assert.equal(result.method, 'llm_default');
  assert.equal(result.final_confidence, 0.7);
  assert.deepEqual(result.votes, { primary: 0, secondary: 0 });
});

test('skips count as no vote: 1 runner-up vote + 2 skips shifts the result', () => {
  const result = combine(analysis, [pick(1, 'autumn_warm'), pick(2, null), pick(3, null)]);
  assert.equal(result.final_season, 'autumn_warm');
  assert.equal(result.method, 'draping_shifted');
});

test('skip does not dilute agreement: 2 primary votes + 1 skip confirms', () => {
  const result = combine(analysis, [pick(1, 'spring_warm'), pick(2, 'spring_warm'), pick(3, null)]);
  assert.equal(result.final_season, 'spring_warm');
  assert.equal(result.method, 'llm_confirmed');
  assert.ok(result.final_confidence > 0.7);
});

// The band is what the user is shown, so it is the number's replacement and
// carries the claim. It must never come out 'strong' unless both signals agree.
const decided = AnalysisSchema.parse({ ...analysis, is_borderline: false });

test('band: both signals agree with a clear margin → strong', () => {
  const picks = [pick(1, 'spring_warm'), pick(2, 'spring_warm'), pick(3, 'spring_warm')];
  assert.equal(confidenceBand(combine(decided, picks)), 'strong');
});

test('band: agreement on a single net vote is only good, not strong', () => {
  const picks = [pick(1, 'spring_warm'), pick(2, null), pick(3, null)];
  assert.equal(confidenceBand(combine(decided, picks)), 'good');
});

test('band: a borderline photo read is never strong, however lopsided the vote', () => {
  const picks = [pick(1, 'spring_warm'), pick(2, 'spring_warm'), pick(3, 'spring_warm')];
  assert.equal(combine(analysis, picks).method, 'llm_confirmed');
  assert.equal(confidenceBand(combine(analysis, picks)), 'good');
});

test('band: overriding the photo read is never strong, even at 3-0', () => {
  const picks = [pick(1, 'autumn_warm'), pick(2, 'autumn_warm'), pick(3, 'autumn_warm')];
  const result = combine(decided, picks);
  assert.equal(result.method, 'draping_shifted');
  assert.equal(confidenceBand(result), 'good');
});

test('band: a narrow override is a close call', () => {
  const picks = [pick(1, 'autumn_warm'), pick(2, null), pick(3, null)];
  assert.equal(confidenceBand(combine(decided, picks)), 'close');
});

test('band: no net vote at all is a close call', () => {
  const tied = [pick(1, 'spring_warm'), pick(2, 'autumn_warm'), pick(3, null)];
  assert.equal(confidenceBand(combine(decided, tied)), 'close');
  const skipped = [pick(1, null), pick(2, null), pick(3, null)];
  assert.equal(confidenceBand(combine(decided, skipped)), 'close');
});
