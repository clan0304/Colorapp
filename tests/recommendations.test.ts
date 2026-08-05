import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEASON_THEMES } from '../lib/card/templates';
import {
  getJewelryRec,
  neutralRun,
  SEASON_RECOMMENDATIONS,
  SEASON_TEMPERATURE,
  TEMPERATURE_DRAPES,
  temperatureRun,
} from '../lib/diagnosis/recommendations';
import { SEASON_TYPES } from '../lib/diagnosis/types';

const HEX = /^#[0-9A-F]{6}$/i;

test('every season has curated avoid + hair recommendations with valid hex', () => {
  for (const season of SEASON_TYPES) {
    const recs = SEASON_RECOMMENDATIONS[season];
    assert.ok(recs, `missing recs for ${season}`);
    assert.ok(recs.avoid.length >= 4, `${season}: need at least 4 avoid colors`);
    assert.ok(recs.hair.length >= 3, `${season}: need at least 3 hair colors`);
    for (const rec of [...recs.avoid, ...recs.hair]) {
      assert.match(rec.hex, HEX, `${season}: bad hex ${rec.hex} (${rec.name})`);
      assert.ok(rec.name.length > 0);
      assert.ok(!/[가-힣]/.test(rec.name), 'no Korean in service strings');
    }
  }
});

test('every season has a named 5-color best palette with valid hex', () => {
  for (const season of SEASON_TYPES) {
    const { palette } = SEASON_THEMES[season];
    assert.equal(palette.length, 5, `${season}: the swatch strip and card both expect 5`);
    for (const color of palette) {
      assert.match(color.hex, HEX, `${season}: bad hex ${color.hex} (${color.name})`);
      assert.ok(color.name.length > 0);
      assert.ok(!/[가-힣]/.test(color.name), 'no Korean in service strings');
    }
  }
});

// The drape comparison drapes palette[0] against avoid[0], so both leading
// entries have to exist and have to be visibly different colors.
test('the drape comparison pair is present and distinct for every season', () => {
  for (const season of SEASON_TYPES) {
    const best = SEASON_THEMES[season].palette[0];
    const worst = SEASON_RECOMMENDATIONS[season].avoid[0];
    assert.ok(best, `${season}: no signature color`);
    assert.ok(worst, `${season}: no avoid color`);
    assert.notEqual(
      best.hex.toUpperCase(),
      worst.hex.toUpperCase(),
      `${season}: comparison drapes the same color on both sides`,
    );
  }
});

test('both temperature drape families are equal-sized with valid named colours', () => {
  const { warm, cool } = TEMPERATURE_DRAPES;
  // Equal halves: the run splits down the middle, and the progress dots gap at
  // swatches.length / 2 to show it.
  assert.equal(warm.length, cool.length, 'the run splits in half, so the sides must match');
  assert.ok(warm.length >= 3, 'too few colours to read as a temperature family');
  for (const color of [...warm, ...cool]) {
    assert.match(color.hex, HEX, `bad hex ${color.hex} (${color.name})`);
    assert.ok(color.name.length > 0);
    assert.ok(!/[가-힣]/.test(color.name), 'no Korean in service strings');
  }
});

test('the run ends on the season own temperature, never starts on it', () => {
  for (const season of SEASON_TYPES) {
    const run = temperatureRun(season);
    const mine = SEASON_TEMPERATURE[season];
    assert.equal(run.length, TEMPERATURE_DRAPES.warm.length * 2);
    assert.equal(run[0].suits, false, `${season}: run must open on the opposite temperature`);
    assert.equal(run[run.length - 1].suits, true, `${season}: run must close on the user's own`);
    assert.equal(run[run.length - 1].temperature, mine);
  }
});

test('suits is true for exactly the half matching the season temperature', () => {
  for (const season of SEASON_TYPES) {
    const run = temperatureRun(season);
    const suiting = run.filter((swatch) => swatch.suits);
    assert.equal(suiting.length, run.length / 2, `${season}: exactly half should suit`);
    for (const swatch of suiting) {
      assert.equal(swatch.temperature, SEASON_TEMPERATURE[season]);
    }
  }
});

test('the neutral run shows both families in a fixed order and names no winner', () => {
  const run = neutralRun();
  const half = TEMPERATURE_DRAPES.warm.length;
  assert.equal(run.length, half * 2);
  for (const [i, swatch] of run.entries()) {
    // Fixed warm-then-cool for every user: the free run has no season to close
    // on, and a stable order is what makes it a recognisable format.
    assert.equal(
      swatch.temperature,
      i < half ? 'warm' : 'cool',
      'the neutral run is warm block then cool block',
    );
    // Load-bearing absence: the clip screen keys the tick/cross off `suits`
    // existing, so a stray field here would stamp a verdict on a run that has
    // not earned one.
    assert.ok(!('suits' in swatch), 'the neutral run must not judge');
    assert.match(swatch.hex, HEX, `bad hex ${swatch.hex} (${swatch.name})`);
    assert.ok(!/[가-힣]/.test(swatch.name), 'no Korean in service strings');
  }
});

test('both runs draw the same colours, so the free one is not a lesser preview', () => {
  const neutral = [...neutralRun()].map((swatch) => swatch.hex).sort();
  for (const season of SEASON_TYPES) {
    const personalised = temperatureRun(season)
      .map((swatch) => swatch.hex)
      .sort();
    assert.deepEqual(neutral, personalised, `${season}: both runs come from TEMPERATURE_DRAPES`);
  }
});

test('jewelry recommendation covers every undertone', () => {
  assert.equal(getJewelryRec({ undertone: 'warm' }).metal, 'gold');
  assert.equal(getJewelryRec({ undertone: 'cool' }).metal, 'silver');
  assert.equal(getJewelryRec({ undertone: 'neutral_warm' }).metal, 'both');
  assert.equal(getJewelryRec({ undertone: 'neutral_cool' }).metal, 'both');
});
