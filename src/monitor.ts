import { execFile } from 'node:child_process';
import { log } from './log';

const ARGS = ['monitor', 'off'];

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

      log('Display off sent, the physical monitor should now be in standby.');
      resolve();
    });
  });
}
