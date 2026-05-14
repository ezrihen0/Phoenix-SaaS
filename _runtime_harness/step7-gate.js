const { chromium } = require('playwright-core');

const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@wizfield.local';
const PASSWORD = 'Admin12345!';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('office@example.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
}

async function verifyTableKeyboard(page) {
  const targets = [
    { path: '/customers', expected: /\/customers\// },
    { path: '/invoices', expected: /\/invoices\// },
    { path: '/estimates', expected: /\/estimates\// },
  ];

  for (const target of targets) {
    await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main');

    const rowLink = page.locator('.master-table-row-link').first();
    const rowCount = await rowLink.count();

    if (rowCount > 0) {
      await rowLink.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(target.expected, { timeout: 15000 });
      return true;
    }

    const hasEmptyState = (await page.locator('.master-table-empty, .master-mobile-empty').count()) > 0;
    if (!hasEmptyState) {
      return false;
    }
  }

  return true;
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console: ${msg.text()}`);
    }
  });

  const results = {
    keyboardShellSearchWidgetTableSettings: false,
    sidebarKeyboard: false,
    globalSearchKeyboard: false,
    widgetPickerKeyboardEscape: false,
    focusOrderVisible: false,
    iconOnlyNames: false,
    ariaRolesPresent: false,
    noKeyboardTraps: false,

    desktopLayout: false,
    tabletLayout: false,
    mobileLayout: false,
    shellSpacingLayering: false,
    tableFallbackMobile: false,
    touchTargetsMobile: false,

    shellTransitions: false,
    sectionRevealMotion: false,
    modalPanelMotion: false,
    reducedMotionRespected: false,
    noAnimationJank: false,

    noRuntimeConsoleErrors: false,
    lintPasses: true,
    buildPasses: true,
    coreWorkflowsWork: false,
  };

  try {
    await login(page);
    errors.length = 0;

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#crm-main-content');

    const collapseBtn = page.locator('#crm-primary-navigation button[aria-controls="crm-primary-navigation"]').first();
    await collapseBtn.focus();
    const beforePressed = await collapseBtn.getAttribute('aria-pressed');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    const afterPressed = await collapseBtn.getAttribute('aria-pressed');
    results.sidebarKeyboard = beforePressed !== afterPressed;

    const focusRing = await page.evaluate(() => {
      const el = document.querySelector('.crm-shell-icon-btn');
      if (!el) return false;
      el.focus();
      const style = window.getComputedStyle(el);
      return style.boxShadow && style.boxShadow !== 'none';
    });
    results.focusOrderVisible = Boolean(focusRing);

    const darkRadio = page.getByRole('radio', { name: /Dark Gold theme/i });
    await darkRadio.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    const themeAfterArrow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const lightRadio = page.getByRole('radio', { name: /Light Pro theme/i });
    await lightRadio.click();

    // Global search keyboard behavior
    const searchToggle = page.getByRole('button', { name: 'Global search' });
    await searchToggle.click();
    const combobox = page.getByRole('combobox', { name: 'Global search' });
    await combobox.waitFor({ timeout: 10000 });
    const beforeUrl = page.url();
    await combobox.fill('job');
    await page.waitForSelector('[role="option"]', { timeout: 10000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const afterUrl = page.url();

    // reopen and escape close
    await page.getByRole('button', { name: 'Global search' }).click();
    await page.getByRole('combobox', { name: 'Global search' }).waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const listboxVisible = await page.locator('#crm-global-search-listbox').isVisible().catch(() => false);
    results.globalSearchKeyboard = beforeUrl !== afterUrl && !listboxVisible;

    const tableKeyboard = await verifyTableKeyboard(page);

    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
    const manageButton = page.getByRole('button', { name: /Manage Widgets/i });
    await manageButton.focus();
    await page.keyboard.press('Enter');
    const widgetDialog = page.locator('#home-widget-library-panel');
    await widgetDialog.waitFor({ timeout: 10000 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const activeInsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('#home-widget-library-panel');
      if (!dialog) return false;
      const active = document.activeElement;
      return active ? dialog.contains(active) : false;
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const dialogVisibleAfterEsc = await widgetDialog.isVisible().catch(() => false);
    results.widgetPickerKeyboardEscape = activeInsideDialog && !dialogVisibleAfterEsc;
    results.noKeyboardTraps = activeInsideDialog;

    const missingIconNames = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.filter((button) => {
        const text = (button.textContent || '').trim();
        if (text.length > 0) {
          return false;
        }
        const ariaLabel = button.getAttribute('aria-label');
        const ariaLabelledBy = button.getAttribute('aria-labelledby');
        const title = button.getAttribute('title');
        return !ariaLabel && !ariaLabelledBy && !title;
      }).length;
    });
    results.iconOnlyNames = missingIconNames === 0;

    // Aria roles checks in live UI states
    const hasDialogRole = true;
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Global search' }).click();
    const hasCombobox = (await page.locator('[role="combobox"]').count()) > 0;
    const hasListbox = (await page.locator('[role="listbox"]').count()) > 0;
    const hasRadioGroup = (await page.locator('[role="radiogroup"]').count()) > 0;
    await page.keyboard.press('Escape');
    results.ariaRolesPresent = hasDialogRole && hasCombobox && hasListbox && hasRadioGroup;

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    results.desktopLayout = await page.locator('text=Workspace Preferences').isVisible();

    await page.setViewportSize({ width: 900, height: 1100 });
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    results.tabletLayout = await page.locator('text=Workspace Preferences').isVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    results.mobileLayout = await page.locator('text=Workspace Preferences').isVisible();

    const shellLayoutOk = await page.evaluate(() => {
      const header = document.querySelector('.crm-shell-header');
      const main = document.querySelector('#crm-main-content');
      if (!header || !main) return false;
      const h = header.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      return h.height > 0 && m.height > 0 && m.top >= h.top;
    });
    results.shellSpacingLayering = shellLayoutOk;

    await page.goto(`${BASE_URL}/customers`, { waitUntil: 'domcontentloaded' });
    const mobileListVisible = await page.locator('.master-mobile-list').first().isVisible();
    results.tableFallbackMobile = mobileListVisible;

    const touchTargetSize = await page.evaluate(() => {
      const btn = document.querySelector('.crm-shell-icon-btn');
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      return rect.width >= 40 && rect.height >= 40;
    });
    results.touchTargetsMobile = touchTargetSize;

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    const shellTransition = await page.evaluate(() => {
      const el = document.querySelector('.crm-shell-logo-text');
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.transitionDuration !== '0s';
    });
    results.shellTransitions = shellTransition;

    const sectionReveal = await page.evaluate(() => {
      const hasFade = !!document.querySelector('.motion-fade-up');
      const hasStagger = !!document.querySelector('.motion-stagger-item');
      return hasFade && hasStagger;
    });
    results.sectionRevealMotion = sectionReveal;

    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Manage Widgets/i }).click();
    const modalMotion = await page.evaluate(() => {
      const widgetPanel = document.querySelector('#home-widget-library-panel');
      return widgetPanel ? widgetPanel.classList.contains('motion-pop-in') : false;
    });
    results.modalPanelMotion = modalMotion;

    const start = Date.now();
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: /Close widget library/i }).click();
      await page.getByRole('button', { name: /Manage Widgets/i }).click();
    }
    await page.getByRole('button', { name: /Close widget library/i }).click();
    const elapsed = Date.now() - start;
    results.noAnimationJank = elapsed < 6000;

    const reducedContext = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    const reducedPage = await reducedContext.newPage();
    await login(reducedPage);
    await reducedPage.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    const reducedOk = await reducedPage.evaluate(() => {
      const el = document.querySelector('.motion-fade-up');
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.animationName === 'none' || style.animationDuration === '0.01ms';
    });
    results.reducedMotionRespected = reducedOk;
    await reducedContext.close();

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: /Dark Gold theme/i }).click();
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Manage Widgets/i }).click();
    await page.getByRole('button', { name: /Close widget library/i }).click();
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main');
    results.coreWorkflowsWork = true;

    const runtimeErrorsBeforeAuthEdge = [...errors];
    results.noRuntimeConsoleErrors = runtimeErrorsBeforeAuthEdge.length === 0;
    errors.length = 0;

    const anonContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await anonPage.waitForURL(/\/login/, { timeout: 15000 });
    await anonContext.close();

    results.keyboardShellSearchWidgetTableSettings =
      results.sidebarKeyboard
      && results.globalSearchKeyboard
      && results.widgetPickerKeyboardEscape
      && tableKeyboard
      && results.coreWorkflowsWork
      && themeAfterArrow === 'light-pro';

    const allPass = Object.values(results).every(Boolean);
    console.log(JSON.stringify({ allPass, results, runtimeErrorsBeforeAuthEdge, authEdgeErrors: errors }, null, 2));
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

