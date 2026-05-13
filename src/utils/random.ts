/** Fisher-Yates Shuffle */
export function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Returns the whole shuffled array if `n` exceeds its length. */
export function pick<T>(arr: T[], n: number): T[] {
  if (n <= 0) return [];
  return shuffle(arr).slice(0, n);
}
