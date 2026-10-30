// The order flow in a real browser at phone size: design a sign, approve the
// proof, place the order and land on the confirmation page. Also checks that a
// tampered price is ignored and that share links open the saved design.
// Then the dashboard: the owner takes payment and releases cut files, stocks
// sheets, nests the order onto a panel and marks it cut; a production login sees
// the board and files but no prices or contact details.
//   npm run test:e2e        (builds nothing; run `npm run build` first)
// Starts its own in-memory database and the built app, so it never touches Supabase.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const DB_PORT = 54331, APP_PORT = 3111;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const OUT = 'test-output/e2e';
mkdirSync(OUT, { recursive: true });
const procs = [];
let browser;
// the page in use, for a screenshot when a step fails
let current;

function start(cmd, args, env, ready) {
  return new Promise((resolve, reject) => {
    // own process group, so stopping it also stops the servers npx starts
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    procs.push(p);
    let log = '';
    const onData = (d) => {
      log += d;
      if (ready.test(log)) resolve(p);
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('exit', (code) => reject(new Error(`${cmd} exited ${code}\n${log}`)));
    setTimeout(() => reject(new Error(`${cmd} not ready\n${log}`)), 60_000);
  });
}

const step = (name) => console.log(`• ${name}`);

async function main() {
  await start('npx', ['tsx', 'scripts/local-db.ts'], { LOCAL_DB_DIR: 'memory', LOCAL_DB_PORT: String(DB_PORT) }, /Local database ready/);
  // no Supabase, Resend or Turnstile keys: files and emails are logged, never sent
  // ALLOW_DEV_LOGIN turns on the one-click sign-in this test uses; it is never available on Vercel
  const env = { DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`, SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '', ADMIN_EMAIL: '', ALLOW_DEV_LOGIN: '1', VERCEL: '' };
  await start('npx', ['next', 'start', '-p', String(APP_PORT)], env, /Ready in/);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const next = async (label = /^Next|Start designing/) => {
    const btn = page.getByRole('button', { name: label });
    await btn.waitFor();
    await page.waitForFunction((el) => !el.disabled, await btn.elementHandle(), { timeout: 30_000 });
    await btn.click();
  };

  step('landing page lists the products');
  await page.goto('/');
  await page.getByRole('link', { name: 'Design your sign' }).first().waitFor();
  assert.ok(await page.getByText('Nursery name sign').count());

  step('pick a nursery name sign and type the name');
  await page.goto('/design');
  await page.getByRole('radio', { name: /Nursery name sign/ }).click();
  await next();
  await page.getByRole('textbox').first().fill('Ava');
  await page.screenshot({ path: `${OUT}/1-text.png` });
  await next();

  step('font, size, style');
  await page.getByRole('heading', { name: /Pick fonts/ }).waitFor();
  await page.getByRole('button', { name: /Lobster/ }).click();
  await page.screenshot({ path: `${OUT}/2-font.png` });
  await next();
  await page.getByRole('radio', { name: /30 in wide/ }).click();
  await next();
  await next();

  step('paint it black');
  await page.getByRole('radio', { name: /Painted, one colour/ }).click();
  await page.getByRole('button', { name: /^Black/ }).click();
  await page.screenshot({ path: `${OUT}/3-finish.png` });
  await next();

  step('extras: keyholes');
  await page.getByLabel(/Keyhole slots/).check();
  await next();

  step('proof: spelled out, refund policy, approval required');
  await page.getByRole('heading', { name: /Check your proof/ }).waitFor();
  await page.getByText('If you cancel before cutting starts').waitFor();
  const approve = page.getByRole('button', { name: 'Approve and continue' });
  assert.equal(await approve.isDisabled(), true, 'cannot continue without approving');
  await page.screenshot({ path: `${OUT}/4-proof.png`, fullPage: true });
  const proofPrice = (await page.locator('[data-price]').textContent()).trim();
  await page.getByRole('checkbox', { name: /I’ve checked the spelling/ }).check();
  await next('Approve and continue');

  step('details and submit');
  await page.getByLabel('Your name').fill('Jane Smith');
  await page.getByLabel('Email').fill('jane@example.com');
  await page.getByLabel('Phone').fill('780-555-0100');
  await page.getByLabel('How did you hear about us?').selectOption('Facebook Marketplace');
  await page.screenshot({ path: `${OUT}/5-details.png`, fullPage: true });
  await page.getByRole('button', { name: /Place order/ }).click();
  await page.waitForURL(/\/order\/S-1001\/confirmation\?t=/, { timeout: 60_000 });
  await page.getByText('Thank you, Jane').waitFor();
  const body = await page.textContent('main');
  assert.match(body, /S-1001/);
  assert.match(body, new RegExp(`Amount due: \\${proofPrice}`));
  assert.match(body, /Send an Interac e-Transfer to .* put your order number S-1001/);
  assert.match(body, /“Ava” in Lobster/);
  await page.screenshot({ path: `${OUT}/6-confirmation.png`, fullPage: true });
  console.log(`  order S-1001 placed for ${proofPrice}`);

  step('the confirmation page needs the order’s own token');
  assert.equal((await page.request.get('/order/S-1001/confirmation?t=wrong')).status(), 404);

  step('a tampered price is ignored');
  const design = { productId: 'product.nursery-name', lines: [{ role: 'main', text: 'Liam', fontId: 'font.pacifico' }], sizeId: 'size.w36', styleId: 'style.one-piece', materialId: 'material.birch-6mm', finishId: 'finish.raw', colourIds: [], placementId: 'placement.indoor', addonIds: [], deliveryId: 'delivery.pickup' };
  const res = await page.request.post('/api/orders', {
    data: { design, contact: { name: 'Tam Per', email: 'tam@example.com', phone: '7805550101' }, proofApproved: true, totalCents: 100, quote: { totalCents: 100 } },
  });
  assert.equal(res.status(), 201);
  assert.equal((await res.json()).totalCents, 7500);

  step('share link opens the design at the proof');
  const share = await page.request.post('/api/designs', { data: { design } });
  assert.equal(share.status(), 201);
  const { url } = await share.json();
  await page.goto(url);
  await page.getByRole('heading', { name: /Check your proof/ }).waitFor();
  await page.getByText('Liam', { exact: false }).first().waitFor();

  await dashboard(browser, errors);

  assert.deepEqual(errors, [], 'no errors in the browser');
  await browser.close();
  console.log('Order flow and dashboard passed. Screenshots in test-output/e2e/');
}

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Dev sign-in email').fill(email);
  await page.getByRole('button', { name: 'Dev sign-in' }).click();
  await page.waitForURL(/\/admin$/);
}

async function dashboard(browser, errors) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  current = page;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  step('admin needs sign-in; strangers can’t sign in');
  await page.goto('/admin');
  await page.waitForURL(/\/login/);
  await page.getByLabel('Dev sign-in email').fill('stranger@example.com');
  await page.getByRole('button', { name: 'Dev sign-in' }).click();
  await page.getByText('That email isn’t invited.').waitFor();

  step('owner: home cards and queue');
  await signIn(page, 'donovanarntson@gmail.com');
  await page.getByText('Unpaid balance').waitFor();
  await page.screenshot({ path: `${OUT}/7-admin-home.png`, fullPage: true });
  const href = await page.getByRole('link', { name: 'S-1001' }).first().getAttribute('href');
  const orderId = href.split('/').pop();

  step('opening the order moves it to Awaiting payment; cut files locked until paid');
  await page.goto(href);
  await page.getByRole('heading', { name: /Status: Awaiting payment/ }).waitFor();
  await page.getByText('SVG for LightBurn (locked)').waitFor();
  assert.equal((await page.request.get(`/api/admin/orders/${orderId}/files/svg`)).status(), 403);
  assert.equal((await page.request.get(`/api/admin/orders/${orderId}/files/png`)).status(), 200);

  step('mark as paid: Paid in full, cut files released');
  await page.getByRole('button', { name: /Mark as paid/ }).click();
  await page.getByRole('heading', { name: /Status: Paid in full/ }).waitFor();
  await page.getByText('Paid in full', { exact: true }).first().waitFor();
  const svg = await page.request.get(`/api/admin/orders/${orderId}/files/svg`);
  assert.equal(svg.status(), 200);
  assert.match(await svg.text(), /<svg[^>]+width="[\d.]+in"/);
  assert.match(svg.headers()['content-disposition'], /S-1001_Smith_30in_Birch-6mm\.svg/);
  await page.screenshot({ path: `${OUT}/8-order-paid.png`, fullPage: true });

  step('inventory: buy 3 sheets of birch');
  await page.goto('/admin/inventory');
  await page.getByLabel('Birch plywood 1/4 in sheets bought').fill('3');
  await page.getByRole('region', { name: 'Birch plywood 1/4 in' }).getByRole('button', { name: 'Add stock' }).click();
  await page.getByRole('region', { name: 'Birch plywood 1/4 in' }).getByText('3', { exact: true }).first().waitFor();

  step('nesting: the paid order nests onto Panel A; the panel file is true size with its order label');
  await page.goto('/admin/nesting?material=material.birch-6mm');
  await page.getByLabel('Select S-1001').check();
  await page.getByRole('button', { name: 'Nest 1 order' }).click();
  await page.waitForURL(/\/admin\/nesting\/[0-9a-f-]{36}$/);
  const panel = page.getByRole('region', { name: 'Sheet 1 Panel A' });
  await panel.getByText('S-1001', { exact: false }).first().waitFor();
  const dl = await page.request.get(await panel.getByRole('link', { name: 'Download SVG' }).getAttribute('href'));
  assert.equal(dl.status(), 200);
  const panelSvg = await dl.text();
  assert.match(panelSvg, /width="48\.0000in" height="47\.8750in"/);
  assert.match(panelSvg, /<g id="labels"[^>]*>.*S-1001/s);
  assert.match(dl.headers()['content-disposition'], /_Birch-6mm_Sheet1_PanelA\.svg/);
  await page.screenshot({ path: `${OUT}/10-nesting.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mark as cut' }).click();
  await page.getByText(/Marked as cut\. 1 order moved to In production; \d+ offcuts? saved/).waitFor();
  await page.goto('/admin/inventory');
  await page.getByRole('region', { name: 'Birch plywood 1/4 in' }).getByText(/2 sheets · 1 spare panel/).waitFor();

  step('reports: money received, GST tracker and CSV export');
  await page.goto('/admin/reports');
  await page.getByRole('heading', { name: 'GST registration tracker' }).waitFor();
  assert.match(await page.locator('main').innerText(), /Money received\s*\$90/);
  const csv = await page.request.get('/api/admin/export/orders');
  assert.equal(csv.status(), 200);
  assert.match(await csv.text(), /^Order,Date,Status,Customer/);
  assert.match(await (await page.request.get('/api/admin/export/payments')).text(), /S-1001,payment,90\.00/);
  await page.getByRole('button', { name: 'Daily digest' }).click();
  await page.getByText(/daily digest: (sent|skipped)/).waitFor();

  step('a customer cancellation before cutting records a 50% refund');
  await page.goto('/admin/orders?q=S-1002');
  await page.getByRole('link', { name: 'S-1002' }).click();
  await page.getByRole('button', { name: /Mark as paid/ }).click();
  await page.getByRole('heading', { name: /Status: Paid in full/ }).waitFor();
  await page.getByRole('button', { name: 'Cancel order…' }).click();
  await page.getByLabel('Reason for cancelling').fill('Changed their mind');
  await page.getByText('Refund owed: $37.50').waitFor();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByRole('heading', { name: 'Cancelled' }).waitFor();
  await page.getByText('−$37.50').waitFor();

  step('invite a production user');
  await page.goto('/admin/settings/users');
  await page.getByLabel('Email to invite').fill('helper@example.com');
  await page.getByLabel('Role', { exact: true }).selectOption('production');
  await page.getByRole('button', { name: 'Invite' }).click();
  await page.getByRole('cell', { name: 'helper@example.com' }).waitFor();

  step('quick quote shows a price');
  await page.goto('/admin/quote');
  await page.getByRole('textbox', { name: 'Main name' }).fill('Mila');
  await page.getByRole('button', { name: 'Copy price message' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button.btn')?.hasAttribute('disabled'), null, { timeout: 30_000 });
  assert.match(await page.getByLabel('Quote message').inputValue(), /Mila.*” sign, .*: \$\d+/);

  step('production: board, specs and files, but no prices, payments or contact details');
  await page.request.post('/logout');
  await ctx.clearCookies();
  await signIn(page, 'helper@example.com');
  await page.getByRole('heading', { name: 'What to cut next' }).waitFor();
  await page.goto(`/admin/orders/${orderId}`);
  await page.getByRole('heading', { name: 'S-1001' }).waitFor();
  const html = await page.content();
  for (const secret of ['$90', 'jane@example.com', '780-555-0100', 'Smith', 'Payments', 'Customer'])
    assert.ok(!html.includes(secret), `production page shows ${secret}`);
  assert.equal((await page.request.get(`/api/admin/orders/${orderId}/files/svg`)).status(), 200);
  await page.goto('/admin/orders');
  await page.waitForURL(/denied=1/);
  await page.goto('/admin/reports');
  await page.waitForURL(/denied=1/);
  assert.equal((await page.request.get('/api/admin/export/orders')).status(), 403);
  await page.goto('/admin/nesting');
  await page.getByRole('heading', { name: 'Nesting' }).waitFor();
  assert.ok(!(await page.locator('main').innerText()).includes('$'), 'nesting shows no money to production');
  await page.goto('/admin/board');
  await page.getByRole('region', { name: 'In production' }).getByText('S-1001').waitFor();
  await page.getByRole('button', { name: '→ Ready' }).first().click();
  await page.getByRole('region', { name: 'Ready' }).getByText('S-1001').waitFor();
  await page.screenshot({ path: `${OUT}/9-production-board.png`, fullPage: true });
  await ctx.close();
}

main()
  .catch(async (e) => {
    await current?.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close().catch(() => {});
    for (const p of procs) {
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {}
    }
  });
