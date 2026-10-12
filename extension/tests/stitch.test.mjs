import test from 'node:test';
import assert from 'node:assert/strict';
import { imageGeometry, frameRegion } from '../stitch-plan.mjs';

test('native screenshot dimensions determine scale and preserve page zoom', () => {
  assert.deepEqual(imageGeometry({ viewportWidth: 1000, viewportHeight: 800, totalHeight: 1900 }, { width: 1500, height: 1200 }), { width: 1500, height: 2850, scale: 1.5 });
});
test('overlapping final viewport crops previously covered content', () => {
  assert.deepEqual(frameRegion({ y: 1100, viewportHeight: 800, totalHeight: 1900, covered: 1600, scale: 2 }), { sourceY: 1000, destinationY: 3200, height: 600, covered: 1900 });
});
test('actual screenshot resolution also enforces memory limits', () => {
  assert.throws(() => imageGeometry({ viewportWidth: 1000, viewportHeight: 800, totalHeight: 19000 }, { width: 3000, height: 2400 }), /too large/);
});
test('incompatible viewport aspect ratio and uncovered gaps are rejected', () => {
  assert.throws(() => imageGeometry({ viewportWidth: 1000, viewportHeight: 800, totalHeight: 1900 }, { width: 1500, height: 800 }), /dimensions changed/);
  assert.throws(() => frameRegion({ y: 900, viewportHeight: 800, totalHeight: 1900, covered: 800, scale: 1 }), /gap/);
});
