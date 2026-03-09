import fs from 'node:fs';
import path from 'node:path';

export function loadConfig() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  }
  return {
    baseUrl: process.env.SONOS_BASE_URL || 'https://play.sonos.com/zh-cn/web-app',
    searchUrl: process.env.SONOS_SEARCH_URL || 'https://play.sonos.com/zh-cn/search',
    roomName: process.env.SONOS_ROOM_NAME || '客厅 play5',
    volume: Number(process.env.SONOS_VOLUME || '0'),
    allowedServices: (process.env.SONOS_ALLOWED_SERVICES || '网易云音乐,QQ音乐').split(',').map(s => s.trim()).filter(Boolean),
    browserChannel: process.env.SONOS_PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
    headless: String(process.env.SONOS_PLAYWRIGHT_HEADLESS || 'false') === 'true',
    userDataDir: process.env.SONOS_PLAYWRIGHT_USER_DATA_DIR || path.resolve(process.cwd(), '.playwright-sonos-profile')
  };
}
