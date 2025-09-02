import { test } from 'node:test';
import assert from 'node:assert';
import { parseMetadata } from '../src/metadataUtils.js';

test('parseMetadata extracts key-value pairs', () => {
  const xml = '<meta><plate>1</plate><author>John</author></meta>';
  assert.deepStrictEqual(parseMetadata(xml), { plate: '1', author: 'John' });
});
