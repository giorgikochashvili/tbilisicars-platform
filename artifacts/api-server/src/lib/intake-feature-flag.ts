/**
 * Pure feature-flag parser for the Regional Brands Gateway intake endpoint.
 *
 * This module never reads process.env. A future startup caller reads
 * process.env["RBG_CORE_INTAKE_ENABLED"] and passes the string value into
 * parseIntakeFeatureFlag().
 *
 * No module-level side effects. No logging.
 */

/**
 * Returns true if and only if the supplied value, after ECMAScript .trim(),
 * equals the exact lowercase string "true".
 *
 * Every other value — including undefined, empty string, "1", "yes", "TRUE",
 * whitespace-only strings — returns false.
 *
 * Pure and deterministic. Never reads process.env.
 */
export function parseIntakeFeatureFlag(value: string | undefined): boolean {
  return value?.trim() === "true";
}
