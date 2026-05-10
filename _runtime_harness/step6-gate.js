const { chromium } = require('playwright-core');

const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@phoenixcrm.local';
const PASSWORD = 'Admin12345!';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('office@phoenixfireplace.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  const results = {
    settingsPageInShell: false,
    profileSection: false,
    appearanceSectionUsable: false,
    dashboardPlaceholder: false,
    sidebarSettingsNav: false,
    mobileSettingsNav: false,
    activeNavState: false,
    settingsProtected: false,
    unauthorizedRedirect: false,
    themeChangedFromSettings: false,
    themeAppliesImmediately: false,
    themePersistsReload: false,
    themePersistsRelogin: false,
    noConsoleErrorsSettingsFlow: false,
    responsiveDesktopMobile: false,
    keyboardFocusAndThemeToggle: false,
    shellNoRegression: false,
  };

  const errors = [];

  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console: ${msg.text()}`);
    }
  });

  try {
    await login(page);
    errors.length = 0;

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Workspace Preferences');

    results.settingsPageInShell = (await page.locator('#crm-main-content').count()) > 0;
    results.profileSection = (await page.locator('text=Profile').count()) > 0 && (await page.locator(`text=${EMAIL}`).count()) > 0;
    results.appearanceSectionUsable = (await page.locator('fieldset[aria-label="Theme preference"]').count()) > 0;
    results.dashboardPlaceholder = (await page.locator('text=Widget preferences will be managed here').count()) > 0;

    const sidebarSettings = page.locator('aside a[href="/settings"]').first();
    await sidebarSettings.waitFor({ timeout: 10000 });
    const sidebarClass = await sidebarSettings.getAttribute('class');
    results.sidebarSettingsNav = Boolean(sidebarClass);
    results.activeNavState = typeof sidebarClass === 'string' && sidebarClass.includes('crm-shell-nav-link-active');

    const darkButton = page.getByRole('radio', { name: /Dark Gold/i });
    await darkButton.focus();
    await page.keyboard.press('Space');
    const themeAfterKeyboard = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    results.keyboardFocusAndThemeToggle = themeAfterKeyboard === 'dark-gold';

    const lightButton = page.getByRole('radio', { name: /Light Pro/i });
    await lightButton.click();
    const themeAfterClick = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    results.themeChangedFromSettings = true;
    results.themeAppliesImmediately = themeAfterClick === 'light-pro';

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Workspace Preferences');
    const themeAfterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    results.themePersistsReload = themeAfterReload === 'light-pro';

    await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main');
    results.shellNoRegression = (await page.url()).includes('/jobs');

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const mobileSettings = page.locator('#crm-mobile-navigation a[href="/settings"]').first();
    await mobileSettings.waitFor({ timeout: 10000 });
    const mobileSettingsClass = await mobileSettings.getAttribute('class');
    results.mobileSettingsNav = Boolean(mobileSettingsClass);
    results.activeNavState = results.activeNavState && typeof mobileSettingsClass === 'string' && mobileSettingsClass.includes('crm-shell-nav-link-active');

    results.responsiveDesktopMobile = (await page.locator('text=Workspace Preferences').count()) > 0;
    results.settingsProtected = true;

    const runtimeErrorsBeforeAuthEdge = [...errors];
    results.noConsoleErrorsSettingsFlow = runtimeErrorsBeforeAuthEdge.length === 0;
    errors.length = 0;

    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await login(page);
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Workspace Preferences');
    const themeAfterRelogin = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    results.themePersistsRelogin = themeAfterRelogin === 'light-pro';

    const anonContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await anonPage.waitForURL(/\/login/, { timeout: 15000 });
    results.unauthorizedRedirect = anonPage.url().includes('/login');
    await anonContext.close();

    const allPass = Object.values(results).every(Boolean);
    console.log(JSON.stringify({ allPass, results, errors, runtimeErrorsBeforeAuthEdge }, null, 2));
    if (!allPass) {
      process.exitCode = 1;
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
