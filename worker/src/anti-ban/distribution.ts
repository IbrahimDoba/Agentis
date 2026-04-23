/**
 * Truncated normal distribution sample.
 * Returns a value between `min` and `max`, clustered around the midpoint.
 * Uses the Box-Muller transform.
 */
export function truncatedNormal(min: number, max: number): number {
  const mean = (min + max) / 2
  const std = (max - min) / 4 // ~95% of values within [min, max]

  let sample: number
  let attempts = 0
  do {
    // Box-Muller transform
    const u1 = Math.random()
    const u2 = Math.random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    sample = mean + z * std
    attempts++
  } while ((sample < min || sample > max) && attempts < 20)

  return Math.max(min, Math.min(max, Math.round(sample)))
}
