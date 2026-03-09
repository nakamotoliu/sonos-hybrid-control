import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getSonosCredentials() {
  const { stdout: session } = await execFileAsync('bash', ['-lc', '~/clawd/scripts/bw-ensure-unlocked.sh 2>/dev/null'], { encoding: 'utf8' });
  const BW_SESSION = session.trim();
  if (!BW_SESSION) throw new Error('Bitwarden session unavailable');
  const { stdout } = await execFileAsync('/opt/homebrew/bin/bw', ['list', 'items', '--search', 'Sonos Web App'], {
    encoding: 'utf8',
    env: { ...process.env, BW_SESSION }
  });
  const items = JSON.parse(stdout);
  const item = items.find(x => x?.login?.username && x?.login?.password);
  if (!item) throw new Error('Sonos Web App credential item not found in Bitwarden');
  return { username: item.login.username, password: item.login.password };
}
