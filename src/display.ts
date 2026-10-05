import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { log } from './log';

export type DisplayState = 'on' | 'off' | 'dimmed';

export interface DisplayEvent {
  state: DisplayState;
  /** Milliseconds since the last keyboard or mouse input when the change happened. */
  idleMs: number;
}

const SCRIPT_PATH = join(__dirname, '..', 'scripts', 'watch-display.ps1');
const START_TIMEOUT_MS = 20_000;
const LINE_PATTERN = /^state (on|off|dimmed) (\d+)$/;

/**
 * Follows Windows' display power state through a small PowerShell helper, so we can tell whether
 * "monitor off" really took effect, and whether something woke the display again afterwards.
 */
export class DisplayWatcher {
  /** Every state change seen so far, oldest first. The first entry is the state at start-up. */
  readonly events: DisplayEvent[] = [];
  private readonly listeners = new Set<() => void>();
  private stderr = '';
  private closed = false;

  private constructor(private readonly child: ChildProcess) {
    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line));
    child.stderr!.on('data', (chunk: Buffer) => (this.stderr += chunk.toString()));
    child.on('error', (err) => {
      this.stderr += err.message;
      this.close();
    });
    child.on('close', () => this.close());
  }

  /** Rejects if the helper cannot start or never reports the initial state. */
  static async start(maxSeconds: number): Promise<DisplayWatcher> {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-Seconds', String(maxSeconds)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const watcher = new DisplayWatcher(child);

    if ((await watcher.waitFor(0, () => true, START_TIMEOUT_MS)) === -1) {
      const reason = watcher.stderr.trim() || 'no display state reported';
      watcher.stop();
      throw new Error(reason);
    }
    return watcher;
  }

  /** The most recent state Windows reported. */
  get state(): DisplayState {
    return this.events[this.events.length - 1].state;
  }

  /** Index of the first event at or after `from` that satisfies `match`, or -1 if none arrives within `timeoutMs`. */
  async waitFor(from: number, match: (event: DisplayEvent) => boolean, timeoutMs: number): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let next = from;

    for (;;) {
      for (; next < this.events.length; next++) {
        if (match(this.events[next])) return next;
      }

      const remaining = deadline - Date.now();
      if (this.closed || remaining <= 0) return -1;
      await this.untilChange(remaining);
    }
  }

  stop(): void {
    this.child.kill();
  }

  private onLine(line: string): void {
    const match = LINE_PATTERN.exec(line.trim());
    if (!match) return;

    const event: DisplayEvent = { state: match[1] as DisplayState, idleMs: Number(match[2]) };
    this.events.push(event);
    log(`Windows display state: ${event.state} (last keyboard or mouse input ${event.idleMs} ms ago).`);
    this.notify();
  }

  private close(): void {
    this.closed = true;
    this.notify();
  }

  private untilChange(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.listeners.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.listeners.add(done);
    });
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
