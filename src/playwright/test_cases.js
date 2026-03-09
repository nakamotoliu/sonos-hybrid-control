import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { CASES } from './queries.js';
import { runCase } from './sonos_web.js';

const cfg = loadConfig();
const out = [];
for (const c of CASES) {
  // eslint-disable-next-line no-console
  console.log(`RUN ${c.id}: ${c.prompt}`);
  const res = await runCase(cfg, c);
  out.push(res);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(res));
}
fs.mkdirSync(path.resolve(process.cwd(), 'test-results'), { recursive: true });
fs.writeFileSync(path.resolve(process.cwd(), 'test-results/sonos-playwright-results.json'), JSON.stringify(out, null, 2));
