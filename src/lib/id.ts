/**
 * Collision-free id for shifts.
 *
 * Previously the parser and the "Add Shift" button each kept their own
 * module-level counter (starting at 1 and 1000), which could overlap after
 * enough parses in a single session and produce duplicate React keys.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Pre-Safari-15.4 fallback. Not a real UUID, just unique enough for keys.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
