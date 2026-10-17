import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_LIB, dxCall } from '../../src/renderer/ui/pagekit.js';

// The page toolkit is a string run inside every web page: a syntax error there breaks Dixi on every site.
test('page toolkit parses', () => {
  assert.doesNotThrow(() => new Function(PAGE_LIB));
  assert.doesNotThrow(() => new Function(dxCall('findButton', /^add\b/i, { links: false })));
});
