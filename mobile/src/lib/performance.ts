const starts = new Map<string, number>();

function timestamp(): number {
  return Date.now();
}

export function performanceMark(name: string): void {
  if (!__DEV__) return;

  starts.set(name, timestamp());
  console.debug(`[PERF] ${name}`);
}

export function performanceMeasure(name: string, startName: string): void {
  if (!__DEV__) return;

  const start = starts.get(startName);
  if (start === undefined) return;

  starts.delete(startName);
  console.debug(`[PERF] ${name} ${timestamp() - start} ms`);
}
