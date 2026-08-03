import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lightness, normalizeHex } from '../lib/diagnosis/color';

test('L* anchors: black is 0, white is 100', () => {
  assert.equal(lightness('#000000'), 0);
  assert.ok(Math.abs(lightness('#ffffff')! - 100) < 1e-9);
});

test('mid grey sits near 53.6, not 50 — the point of using L* over an RGB average', () => {
  assert.ok(Math.abs(lightness('#808080')! - 53.585) < 0.01);
});

test('accepts a missing # and is case-insensitive', () => {
  assert.equal(lightness('E8C39E'), lightness('#e8c39e'));
});

test('deeper skin reads lower than lighter skin', () => {
  assert.ok(lightness('#4A3427')! < lightness('#E8C39E')!);
});

test('malformed values the model can emit return null', () => {
  for (const bad of ['', '   ', '#fff', 'not a color', '#12345g']) {
    assert.equal(lightness(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('normalizeHex canonicalises what the model emits into a style-safe value', () => {
  assert.equal(normalizeHex('e8c39e'), '#E8C39E');
  assert.equal(normalizeHex(' #E8C39E '), '#E8C39E');
});

test('normalizeHex rejects the same malformed values as lightness', () => {
  for (const bad of ['', '   ', '#fff', 'not a color', '#12345g']) {
    assert.equal(normalizeHex(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});
