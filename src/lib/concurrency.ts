// Bounded-concurrency map: process `items` in slices of `concurrency`, awaiting
// each slice before starting the next. Keeps N in-flight at a time so a batch of
// network calls (Paystack charges, Resend emails) runs faster than serial
// without unleashing an unbounded burst. Order of results matches input order.
//
// (Mirrors the private `runBatch` in followup-scanner.ts — that one can migrate
// onto this later; extracted here so the cron scans can share it.)
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency))
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit)
    const settled = await Promise.all(slice.map((item, j) => fn(item, i + j)))
    results.push(...settled)
  }
  return results
}
