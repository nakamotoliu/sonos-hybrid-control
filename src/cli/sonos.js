import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runSonos(args) {
  const { stdout, stderr } = await execFileAsync('sonos', args, { encoding: 'utf8' });
  return { stdout, stderr };
}

export async function pause(room) {
  await runSonos(['pause', '--name', room]);
}

export async function status(room) {
  const { stdout } = await runSonos(['status', '--name', room, '--format', 'json']);
  return JSON.parse(stdout);
}

export async function ensureVolume(room, volume) {
  await runSonos(['volume', 'set', '--name', room, String(volume)]);
}

export async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}
