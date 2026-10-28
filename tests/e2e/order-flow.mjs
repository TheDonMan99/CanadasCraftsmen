// The order flow in a real browser at phone size: design a sign, approve the
// proof, place the order and land on the confirmation page. Also checks that a
// tampered price is ignored and that share links open the saved design.
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
  const env = { DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '' };
  await start('npx', ['next', 'start', '-p', String(APP_PORT)], env, /Ready in/);

  const browser = await chromium.launch();
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
  await page.getByRole('link', { name: 'Design your sign' }).waitFor();
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
  const proofPrice = (await page.locator('.sticky .text-lg').textContent()).trim();
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
  await page.getByText('Thank you, Jane!').waitFor();
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

  assert.deepEqual(errors, [], 'no errors in the browser');
  await browser.close();
  console.log('Order flow passed. Screenshots in test-output/e2e/');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const p of procs) {
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {}
    }
  });
