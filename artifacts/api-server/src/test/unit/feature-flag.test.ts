/**
 * Unit tests for intake-feature-flag.ts
 *
 * All tests call parseIntakeFeatureFlag() directly.
 * No process.env mutation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntakeFeatureFlag } from "../../lib/intake-feature-flag.js";

test("parseIntakeFeatureFlag: undefined returns false", () => {
  assert.strictEqual(parseIntakeFeatureFlag(undefined), false);
});

test('parseIntakeFeatureFlag: empty string "" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag(""), false);
});

test('parseIntakeFeatureFlag: space-only " " returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag(" "), false);
});

test('parseIntakeFeatureFlag: tab-only "\\t" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("\t"), false);
});

test('parseIntakeFeatureFlag: newline-only "\\n" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("\n"), false);
});

test('parseIntakeFeatureFlag: "true" returns true', () => {
  assert.strictEqual(parseIntakeFeatureFlag("true"), true);
});

test('parseIntakeFeatureFlag: " true " (leading/trailing spaces) returns true', () => {
  assert.strictEqual(parseIntakeFeatureFlag(" true "), true);
});

test('parseIntakeFeatureFlag: "false" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("false"), false);
});

test('parseIntakeFeatureFlag: "TRUE" (uppercase) returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("TRUE"), false);
});

test('parseIntakeFeatureFlag: "True" (mixed case) returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("True"), false);
});

test('parseIntakeFeatureFlag: "1" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("1"), false);
});

test('parseIntakeFeatureFlag: "yes" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("yes"), false);
});

test('parseIntakeFeatureFlag: "on" returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("on"), false);
});

test('parseIntakeFeatureFlag: "enabled" (arbitrary text) returns false', () => {
  assert.strictEqual(parseIntakeFeatureFlag("enabled"), false);
});
