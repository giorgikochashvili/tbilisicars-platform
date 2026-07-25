/**
 * Three-state feature-flag classifier for the Regional Brands Gateway intake
 * route (HOP B).
 *
 * Pure helper: no process.env access, no logging, does not return the raw
 * input value, cannot prevent Core startup.
 *
 * Phase A's boolean parseIntakeFeatureFlag remains unchanged and independent.
 * This classifier is used by the Phase C startup layer and the router factory.
 */

export type IntakeFeatureClassification =
  | "enabled"
  | "disabled"
  | "disabled_with_warning";

/**
 * Classify the raw RBG_CORE_INTAKE_ENABLED environment-variable value.
 *
 * Rules (ECMAScript String.prototype.trim() applied first):
 *
 *   undefined            → "disabled"
 *   "" (empty)           → "disabled"
 *   "false" (exact)      → "disabled"
 *   "true"  (exact)      → "enabled"
 *   any other value      → "disabled_with_warning"
 *
 * The warning code is "UNRECOGNISED_INTAKE_FLAG_VALUE". It is a fixed string
 * and does not include the raw input.
 */
export function classifyIntakeFeature(
  raw: string | undefined,
): IntakeFeatureClassification {
  if (raw === undefined) return "disabled";
  const trimmed = raw.trim();
  if (trimmed === "")      return "disabled";
  if (trimmed === "false") return "disabled";
  if (trimmed === "true")  return "enabled";
  return "disabled_with_warning";
}

/**
 * Bounded warning code for the disabled_with_warning case.
 * Never includes the raw value. Exported for use by the Phase C startup layer.
 */
export const INTAKE_FLAG_WARNING_CODE =
  "UNRECOGNISED_INTAKE_FLAG_VALUE" as const;
