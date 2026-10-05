function timestamp(): string {
  return new Date().toISOString();
}

export function log(message: string): void {
  console.log(`${timestamp()} ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`${timestamp()} WARN ${message}`);
}

export function logError(message: string): void {
  console.error(`${timestamp()} ERROR ${message}`);
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
