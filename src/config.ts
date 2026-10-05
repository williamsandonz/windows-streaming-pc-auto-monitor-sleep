import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface Config {
  /** Pause after login so the graphics and virtual display drivers finish initialising. */
  delaySeconds: number;
  /** How long to keep checking that the display stays off, re-sending the command if it wakes by itself. 0 sends once and exits. */
  verifySeconds: number;
  nircmdPath: string;
  dryRun: boolean;
}

const PROJECT_ROOT = join(__dirname, '..');

/** Reads .env from the project root, so the working directory does not matter under Startup or Task Scheduler. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(join(PROJECT_ROOT, '.env'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function readNonNegativeNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be zero or a positive number, got "${raw}".`);
  }
  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes'].includes(raw)) return true;
  if (['false', '0', 'no'].includes(raw)) return false;
  throw new Error(`${name} must be true or false, got "${raw}".`);
}

/** NIRCMD_PATH wins, then bin/nircmd.exe in the project, then whatever nircmd.exe is on the PATH. */
function resolveNircmdPath(): string {
  const configured = process.env.NIRCMD_PATH?.trim();
  if (configured) return configured;

  const bundled = join(PROJECT_ROOT, 'bin', 'nircmd.exe');
  return existsSync(bundled) ? bundled : 'nircmd.exe';
}

export function loadConfig(): Config {
  loadDotEnv();

  return {
    delaySeconds: readNonNegativeNumber('DELAY_SECONDS', 5),
    verifySeconds: readNonNegativeNumber('VERIFY_SECONDS', 60),
    nircmdPath: resolveNircmdPath(),
    dryRun: readBoolean('DRY_RUN', false),
  };
}
