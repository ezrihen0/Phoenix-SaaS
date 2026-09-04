const { chromium } = require('playwright-core');

const BASE_URL = 'http://localhost:3000';
const EMAIL = process.env.WIZFIELD_ADMIN_EMAIL?.trim() || "admin@phoenixcrm.local";
const PASSWORD = process.env.WIZFIELD_ADMIN_PASSWORD?.trim();
if (!PASSWORD) {
  throw new Error("WIZFIELD_ADMIN_PASSWORD must be set to run step5-gate.js.");
}
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('office@example.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
}

async function closeLeadModal(page) {
  const closeButton = page.getByRole('button', { name: 'Close' });
  if (await closeButton.isVisible()) {
    await closeButton.click();
  }
  await page.waitForURL((url) => !url.searchParams.has('leadId'), { timeout: 10000 });
  await page.waitForSelector('text=Lead Details', { state: 'hidden', timeout: 10000 });
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
    leadsRouteRowOpen: false,
    leadsKeyboardEnter: false,
    leadsKeyboardSpace: false,
    leadsActionNoRowNav: false,
    customersFilters: false,
    customersPagination: false,
    invoicesPagination: false,
    estimatesFilters: false,
    estimatesPagination: false,
    mobileCustomers: false,
    mobileInvoices: false,
    mobileEstimates: false,
    consoleClean: false,
  };

  try {
    await login(page);
    errors.length = 0;

    await page.goto(`${BASE_URL}/leads`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.master-table tbody tr.master-table-row');
    const firstRow = page.locator('.master-table tbody tr.master-table-row').first();

    await firstRow.click();
    await page.waitForURL(/\/leads\?[^#]*leadId=/, { timeout: 10000 });
    await page.waitForSelector('text=Lead Details');
    results.leadsRouteRowOpen = true;

    await closeLeadModal(page);

    await firstRow.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/leads\?[^#]*leadId=/, { timeout: 10000 });
    await page.waitForSelector('text=Lead Details');
    results.leadsKeyboardEnter = true;

    await closeLeadModal(page);

    await firstRow.focus();
    await page.keyboard.press('Space');
    await page.waitForURL(/\/leads\?[^#]*leadId=/, { timeout: 10000 });
    await page.waitForSelector('text=Lead Details');
    results.leadsKeyboardSpace = true;

    await closeLeadModal(page);

    const beforeActionUrl = page.url();
    await firstRow.locator('td.master-table-actions-cell').first().click({ force: true });
    await page.waitForTimeout(250);
    const afterActionUrl = page.url();
    results.leadsActionNoRowNav = beforeActionUrl === afterActionUrl;

    await page.goto(`${BASE_URL}/customers?q=a&page=1&pageSize=10`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.master-table-pagination');
    results.customersFilters = page.url().includes('/customers?q=a');
    results.customersPagination = (await page.locator('.master-table-pagination').count()) > 0;

    await page.goto(`${BASE_URL}/invoices?page=1&pageSize=10`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.master-table-pagination');
    results.invoicesPagination = (await page.locator('.master-table-pagination').count()) > 0;

    await page.goto(`${BASE_URL}/estimates?q=a&status=sent&lifecycleStatus=sent&page=1&pageSize=10`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.master-table-pagination');
    const estimateStatus = await page.locator('select[name="status"]').inputValue();
    const estimateLifecycle = await page.locator('select[name="lifecycleStatus"]').inputValue();
    results.estimatesFilters = estimateStatus === 'sent' && estimateLifecycle === 'sent';
    results.estimatesPagination = (await page.locator('.master-table-pagination').count()) > 0;

    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${BASE_URL}/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main');
    results.mobileCustomers = await page.locator('.master-mobile-list').first().isVisible();

    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main');
    results.mobileInvoices = await page.locator('.master-mobile-list').first().isVisible();

    await page.goto(`${BASE_URL}/estimates`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main');
    results.mobileEstimates = await page.locator('.master-mobile-list').first().isVisible();

    results.consoleClean = errors.length === 0;

    const allPass = Object.values(results).every(Boolean);
    console.log(JSON.stringify({ allPass, results, errors }, null, 2));

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
