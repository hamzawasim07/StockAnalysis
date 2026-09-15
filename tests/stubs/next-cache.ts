/** Pass-through stand-ins for the Next.js cache helpers used by the data layer. */
export function unstable_cache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return fn;
}

export function revalidateTag() {}
export function revalidatePath() {}
