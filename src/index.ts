import { loadConfig } from './config';
import { describeError, log, logError } from './log';
import { ensureMonitorOff } from './monitor';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (process.platform !== 'win32' && !config.dryRun) {
    throw new Error('Monitor sleep is only implemented for Windows. Set DRY_RUN=true to run on other platforms.');
  }

  log(`Waiting ${config.delaySeconds}s for the graphics and virtual display drivers to initialise.`);
  await sleep(config.delaySeconds * 1000);

  await ensureMonitorOff(config);
}

main().catch((err) => {
  logError(describeError(err));
  process.exitCode = 1;
});
