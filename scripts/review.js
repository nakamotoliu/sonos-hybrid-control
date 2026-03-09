import fs from 'node:fs';
import path from 'node:path';

const files = [
  'package.json',
  'src/cli/sonos.js',
  'src/playwright/bitwarden.js',
  'src/playwright/config.js',
  'src/playwright/queries.js',
  'src/playwright/sonos_web.js',
  'src/playwright/test_cases.js',
  '.env.example',
  '.gitignore'
];

const denyPatterns = [
  /nakamoto_jason/i,
  /jason6666@gmail\.com/i,
  /OPENCLAW_RELAY_TOKEN\s*=\s*['"][^'"]+/i,
  /SONOS_PASSWORD\s*=\s*['"][^'"]+/i,
  /SONOS_USERNAME\s*=\s*['"][^'"]+/i
];

const findings = [];
for (const rel of files) {
  const full = path.resolve(process.cwd(), rel);
  const text = fs.readFileSync(full, 'utf8');
  for (const pat of denyPatterns) {
    if (pat.test(text)) {
      findings.push({ file: rel, issue: `matched forbidden pattern ${String(pat)}` });
      break;
    }
  }
}
const report = { ok: findings.length === 0, findings };
fs.mkdirSync(path.resolve(process.cwd(), 'test-results'), { recursive: true });
fs.writeFileSync(path.resolve(process.cwd(), 'test-results/review.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.ok) process.exit(1);
