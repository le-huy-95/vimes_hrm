/** Canonical pair key for group-scoped DM uniqueness (order-independent). */
export function buildDmPairKey(userIdA: string, userIdB: string): string {
  const a = userIdA.toLowerCase();
  const b = userIdB.toLowerCase();
  if (a === b) {
    throw new Error("DM pair requires two different (not the same) user ids");
  }
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
