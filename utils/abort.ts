export function waitForAbort<T>(
  abortSignal: AbortSignal,
  value: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    abortSignal.addEventListener("abort", () => resolve(value));
  });
}
