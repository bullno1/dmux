export const Aborted = Symbol("Aborted");

export function waitForAbort(
  abortSignal?: AbortSignal,
): Promise<typeof Aborted> {
  return new Promise<typeof Aborted>((resolve) => {
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => resolve(Aborted));
    }
  });
}

export async function* abortableAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  const abortPromise = waitForAbort(signal);

  try {
    while (!signal?.aborted) {
      const result = await Promise.race([
        iterator.next(),
        abortPromise,
      ]);

      if (result === Aborted || result.done) {
        break;
      } else {
        yield result.value;
      }
    }
  } catch (e) {
    iterator.throw?.();
    throw e;
  } finally {
    iterator.return?.();
  }
}
