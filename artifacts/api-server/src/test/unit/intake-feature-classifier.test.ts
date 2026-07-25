/**
 * Unit tests for classifyIntakeFeature (intake-feature-classifier.ts).
 *
 * Pure function — no mocks, no async, no imports beyond node:test and the
 * module under test.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyIntakeFeature,
  INTAKE_FLAG_WARNING_CODE,
} from "../../lib/intake-feature-classifier.js";

// ─── "disabled" cases ─────────────────────────────────────────────────────────

test("classifyIntakeFeature: undefined → disabled", () => {
  assert.strictEqual(classifyIntakeFeature(undefined), "disabled");
});

test("classifyIntakeFeature: empty string → disabled", () => {
  assert.strictEqual(classifyIntakeFeature(""), "disabled");
});

test("classifyIntakeFeature: whitespace-only string → disabled", () => {
  assert.strictEqual(classifyIntakeFeature("   "), "disabled");
});

test("classifyIntakeFeature: exact 'false' → disabled", () => {
  assert.strictEqual(classifyIntakeFeature("false"), "disabled");
});

test("classifyIntakeFeature: 'false' with leading space → disabled (trim applied)", () => {
  assert.strictEqual(classifyIntakeFeature(" false"), "disabled");
});

test("classifyIntakeFeature: 'false' with trailing space → disabled (trim applied)", () => {
  assert.strictEqual(classifyIntakeFeature("false "), "disabled");
});

// ─── "enabled" cases ──────────────────────────────────────────────────────────

test("classifyIntakeFeature: exact 'true' → enabled", () => {
  assert.strictEqual(classifyIntakeFeature("true"), "enabled");
});

test("classifyIntakeFeature: 'true' with surrounding whitespace → enabled", () => {
  assert.strictEqual(classifyIntakeFeature("  true  "), "enabled");
});

// ─── "disabled_with_warning" cases ───────────────────────────────────────────

test("classifyIntakeFeature: 'True' (capital T) → disabled_with_warning", () => {
  assert.strictEqual(classifyIntakeFeature("True"), "disabled_with_warning");
});

test("classifyIntakeFeature: 'TRUE' (all caps) → disabled_with_warning", () => {
  assert.strictEqual(classifyIntakeFeature("TRUE"), "disabled_with_warning");
});

test("classifyIntakeFeature: '1' → disabled_with_warning", () => {
  assert.strictEqual(classifyIntakeFeature("1"), "disabled_with_warning");
});

test("classifyIntakeFeature: '0' → disabled_with_warning", () => {
  assert.strictEqual(classifyIntakeFeature("0"), "disabled_with_warning");
});

test("classifyIntakeFeature: 'yes' → disabled_with_warning", () => {
  assert.strictEqual(classifyIntakeFeature("yes"), "disabled_with_warning");
});

test("classifyIntakeFeature: arbitrary string → disabled_with_warning", () => {
  assert.strictEqual(classifyIntakeFeature("enabled"), "disabled_with_warning");
});

// ─── Warning code is a fixed string, not the raw input ───────────────────────

test("INTAKE_FLAG_WARNING_CODE is a non-empty string", () => {
  assert.ok(typeof INTAKE_FLAG_WARNING_CODE === "string");
  assert.ok(INTAKE_FLAG_WARNING_CODE.length > 0);
});

test("INTAKE_FLAG_WARNING_CODE does not contain 'true' or 'false' (raw input excluded)", () => {
  assert.ok(!INTAKE_FLAG_WARNING_CODE.includes("true"));
  assert.ok(!INTAKE_FLAG_WARNING_CODE.includes("false"));
});
