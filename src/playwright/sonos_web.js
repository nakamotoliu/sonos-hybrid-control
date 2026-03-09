import { chromium } from 'playwright';
import { pause, status, ensureVolume, sleep } from '../cli/sonos.js';
import { getSonosCredentials } from './bitwarden.js';

async function ensureLoggedIn(page) {
  if (!/login\.sonos\.com|signin|authorize/i.test(page.url())) return;
  const creds = await getSonosCredentials();
  const email = page.locator('#okta-signin-username, input[name="username"], input[type="email"], input[type="text"]').first();
  const password = page.locator('#okta-signin-password, input[name="password"], input[type="password"]').first();
  const submit = page.locator('#okta-signin-submit, input[type="submit"][value*="登录"], input[type="submit"][value*="Sign"]').first();
  await email.waitFor({ state: 'visible', timeout: 20000 });
  await email.fill(creds.username);
  await password.fill(creds.password);
  await submit.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(4000);
}

async function openSinglePage(cfg) {
  const context = await chromium.launchPersistentContext(cfg.userDataDir, {
    channel: cfg.browserChannel,
    headless: cfg.headless,
    viewport: { width: 1440, height: 980 }
  });
  const pages = context.pages().filter(p => p.url().includes('play.sonos.com'));
  for (let i = 1; i < pages.length; i++) await pages[i].close().catch(() => {});
  const page = pages[0] || await context.newPage();
  await page.goto(cfg.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await ensureLoggedIn(page);
  return { context, page };
}

export async function runCase(cfg, testCase) {
  const { context, page } = await openSinglePage(cfg);
  try {
    await pause(cfg.roomName);
    await page.goto(cfg.searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await ensureLoggedIn(page);

    const backBtn = page.locator('button[aria-label="返回"]');
    if (await backBtn.count()) {
      const heading = page.getByRole('heading', { name: '搜索' });
      if (!(await heading.count())) await backBtn.first().click().catch(() => {});
    }

    const search = page.locator('input').first();
    await search.fill(testCase.prompt);
    await search.press('Enter');
    await page.waitForTimeout(1500);

    const result = page.locator('button').filter({ hasText: testCase.preferredTitle }).first();
    await result.scrollIntoViewIfNeeded();
    await result.click();
    await page.locator('text=正在加载…').waitFor({ state: 'detached', timeout: 12000 }).catch(() => {});

    const playBtn = page.getByRole('button', { name: new RegExp(`^播放`) }).first();
    await playBtn.scrollIntoViewIfNeeded();
    await playBtn.click();

    await sleep(10000);
    await ensureVolume(cfg.roomName, cfg.volume);
    const st = await status(cfg.roomName);
    return {
      caseId: testCase.id,
      prompt: testCase.prompt,
      selectedTitle: testCase.preferredTitle,
      ok: st?.transport?.State === 'PLAYING',
      nowPlaying: st?.nowPlaying || null,
      volume: st?.volume,
      transport: st?.transport?.State || null
    };
  } finally {
    await context.close().catch(() => {});
  }
}
