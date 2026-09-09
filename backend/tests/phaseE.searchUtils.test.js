/**
 * phaseE.searchUtils.test.js — regex-escaping for the lead search
 * query param.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { escapeRegex } = require('../utils/searchUtils');

const matches = (pattern, text) => new RegExp(escapeRegex(pattern), 'i').test(text);

test('ordinary text still matches as a case-insensitive partial match', () => {
  assert.equal(matches('john', 'John Smith'), true);
  assert.equal(matches('JOHN', 'john smith'), true);
  assert.equal(matches('smith', 'John Smith'), true);
});

test('a "+" in the search text is treated literally, not as regex "one or more"', () => {
  assert.equal(matches('A+B', 'A+B Corp'), true);
  assert.equal(matches('A+B', 'AAAB Corp'), false, 'must NOT interpret + as a regex quantifier');
});

test('every documented metacharacter is escaped and treated literally', () => {
  const metachars = ['.', '(', ')', '+', '*', '?', '[', ']', '{', '}', '\\', '^', '$'];
  for (const ch of metachars) {
    const escaped = escapeRegex(ch);
    // A literal-match regex of the escaped character must match only
    // that literal character in a string, not act as a wildcard, and
    // must not throw when compiled.
    assert.doesNotThrow(() => new RegExp(escaped));
    assert.equal(new RegExp(escaped).test(ch), true, `escaped "${ch}" should still match itself literally`);
  }
});

test('a malformed regex-like pattern does not throw when compiled after escaping', () => {
  const patterns = ['(unclosed', 'a**', '[abc', 'a{2,1}', 'a+++++++++b'];
  for (const p of patterns) {
    assert.doesNotThrow(() => new RegExp(escapeRegex(p), 'i'));
  }
});

test('a dot is escaped and does not act as a wildcard', () => {
  assert.equal(matches('a.b', 'a.b'), true);
  assert.equal(matches('a.b', 'axb'), false, 'unescaped "." would match any character here');
});
