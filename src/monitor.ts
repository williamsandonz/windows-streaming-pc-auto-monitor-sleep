import { execFile } from 'node:child_process';
import type { Config } from './config';
import { DisplayWatcher, type DisplayEvent } from './display';
import { describeError, log, logWarn } from './log';

const ARGS = ['monitor', 'off'];
const MAX_ATTEMPTS = 5;
/** How long Windows gets to report the display going off after the command was sent. */
const OFF_TIMEOUT_MS = 5_000;
/** A wake this soon after keyboard or mouse input was a person, so we leave the display on. */
const USER_INPUT_WINDOW_MS = 3_000;

/**
 * Sends a display-off message so Windows cuts the video signal to the physical
 * monitor. Services and the virtual display keep running, and any keyboard or
 * mouse input wakes the panel again.
 */
export function turnMonitorOff(nircmdPath: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    log(`DRY_RUN is on, not running: ${nircmdPath} ${ARGS.join(' ')}`);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    execFile(nircmdPath, ARGS, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        if (error.code === 'ENOENT') {
          reject(new Error(`NirCmd not found at "${nircmdPath}". Put nircmd.exe in bin/ or set NIRCMD_PATH.`));
          return;
        }
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      log('Display off command sent.');
      resolve();
    });
  });
}

/**
 * Turns the monitor off, then checks Windows agrees and that nothing wakes it again.
 *
 * NirCmd succeeding only means the message was sent. Around login the graphics stack is still
 * settling (the virtual display driver can load late, for example) and that can switch the display
 * back on. If the display wakes with no recent keyboard or mouse input we send the command again;
 * if a person woke it we stop, so input still brings the display back as promised.
 */
export async function ensureMonitorOff(config: Config): Promise<void> {
  if (config.dryRun || config.verifySeconds === 0) {
    await turnMonitorOff(config.nircmdPath, config.dryRun);
    return;
  }

  let watcher: DisplayWatcher;
  try {
    // The helper exits by itself at this cap even if we crash. We stop it as soon as we finish.
    watcher = await DisplayWatcher.start(MAX_ATTEMPTS * (config.verifySeconds + OFF_TIMEOUT_MS / 1000) + 30);
  } catch (err) {
    logWarn(`Cannot follow the display state (${describeError(err)}). Sending display off once without checking.`);
    await turnMonitorOff(config.nircmdPath, false);
    return;
  }

  const wokenByPerson = (event: DisplayEvent): boolean => event.state !== 'off' && event.idleMs < USER_INPUT_WINDOW_MS;
  const leaveOn = (event: DisplayEvent): void =>
    log(`The display was woken by keyboard or mouse input ${event.idleMs} ms ago, leaving it on.`);

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const sentAt = watcher.events.length;
      await turnMonitorOff(config.nircmdPath, false);

      // Windows should report the display going off straight away. A person waking it meanwhile is not a failure.
      let offAt = await watcher.waitFor(sentAt, (event) => event.state === 'off' || wokenByPerson(event), OFF_TIMEOUT_MS);
      if (offAt !== -1 && watcher.events[offAt].state !== 'off') {
        leaveOn(watcher.events[offAt]);
        return;
      }
      if (offAt === -1 && watcher.state === 'off') {
        log('Windows already considered the display off, so there was no change to report.');
        offAt = watcher.events.length - 1;
      }
      if (offAt === -1) {
        logWarn(`Attempt ${attempt}/${MAX_ATTEMPTS}: Windows did not report the display going off within ${OFF_TIMEOUT_MS / 1000}s.`);
        continue;
      }

      const wokeAt = await watcher.waitFor(offAt + 1, (event) => event.state !== 'off', config.verifySeconds * 1000);
      if (wokeAt === -1) {
        log(`The display stayed off for ${config.verifySeconds}s, done.`);
        return;
      }

      const woke = watcher.events[wokeAt];
      if (wokenByPerson(woke)) {
        leaveOn(woke);
        return;
      }

      logWarn(`Attempt ${attempt}/${MAX_ATTEMPTS}: the display woke by itself (no input for ${woke.idleMs} ms). Sending display off again.`);
    }

    throw new Error(`The display did not stay off after ${MAX_ATTEMPTS} attempts. See the display state lines above for what happened.`);
  } finally {
    watcher.stop();
  }
}
