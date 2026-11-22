// @ts-check

// Reproducible desktop integration checks using Chromium and a loopback
// server. This is not a headset test. No real microphone is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/** @typedef {import('playwright').Browser} Browser */
/** @typedef {import('playwright').BrowserContext} BrowserContext */
/** @typedef {import('playwright').Page} Page */
/** @typedef {Window & {stageTestTracks?:MediaStreamTrack[],stageTestRequests?:number}} TestWindow */
const project = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = resolve(project, '..');
const prefix = '/StageTime/';
const useLocalThree = process.env.STAGETIME_TEST_LOCAL_THREE === '1';
const quick = process.env.STAGETIME_BROWSER_QUICK === '1';
const screenshotDir = process.env.STAGETIME_SCREENSHOT_DIR;
/** @type {Record<string,string>} */
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
};

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (path === prefix + '__clean-up-test.html') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Test navigation</title><p>Left the rehearsal</p>');
      return;
    }
    if (!path.startsWith(prefix + 'chatgpt-v0/') && !path.startsWith(prefix + 'assets/audio/')) {
      response.writeHead(404); response.end(); return;
    }
    const relative = decodeURIComponent(path.slice(prefix.length));
    let file = resolve(repoRoot, relative);
    const allowedDir = path.startsWith(prefix + 'chatgpt-v0/')
      ? resolve(repoRoot, 'chatgpt-v0') : resolve(repoRoot, 'assets/audio');
    if ((file !== allowedDir && !file.startsWith(allowedDir + sep)) || relative.includes('node_modules/')) {
      response.writeHead(404); response.end(); return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const type = mime[extname(file)];
    if (!type) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(await readFile(file));
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(undefined)));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Loopback server did not start');
const origin = 'http://127.0.0.1:' + address.port;
const url = origin + prefix + 'chatgpt-v0/';
const executable = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
/** @type {Browser | null} */
let browser = null;

/** @param {BrowserContext} context */
async function usePinnedPackageForTesting(context) {
  if (!useLocalThree) return;
  // Network-isolated development environments can exercise precisely the
  // same npm release as the production CDN. This does not change index.html.
  const cdn = 'https://cdn.jsdelivr.net/npm/three@0.187.0/';
  const packageRoot = resolve(project, 'node_modules/three');
  await context.route(cdn + '**', async route => {
    const file = resolve(packageRoot, new URL(route.request().url()).pathname.split('/three@0.187.0/')[1] || '');
    if (file.startsWith(packageRoot + sep)) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(file),
        headers: { 'access-control-allow-origin': '*' } });
    } else await route.abort();
  });
}

/** @param {BrowserContext} context */
async function openPage(context) {
  await usePinnedPackageForTesting(context);
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return { page, errors };
}

/** @param {Page} page @param {string} query */
async function ready(page, query) {
  await page.goto(url + query, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 30000 });
  } catch (error) {
    throw new Error('Room did not initialise: ' + (await page.locator('#setup-status').textContent()), { cause: error });
  }
  await page.waitForFunction(() => Number(document.body.dataset.drawCalls) > 0);
}

/** @param {Page} page @param {string} key @param {string} value @param {number} [timeout] */
async function waitData(page, key, value, timeout = 12000) {
  await page.waitForFunction(([k, v]) => document.body.dataset[k] === v, [key, value], { timeout });
}

/** @param {Page} page @param {string} key */
async function getData(page, key) {
  return await page.evaluate(k => document.body.dataset[k] || '', key);
}

/** @param {Page} page @param {string} event */
async function waitEvent(page, event) {
  await page.waitForFunction(e => (document.body.dataset.lastEvent || '').startsWith(e), event);
}

/** @param {Page} page @param {string} name */
async function shot(page, name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotDir, name + '.png') });
}

try {
  browser = await chromium.launch({
    executablePath: executable, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--use-fake-device-for-media-stream'],
  });
  console.log('Chromium ' + browser.version() + ' | Three.js ' +
    (useLocalThree ? '0.187.0 (local pinned npm release for tests)' : '0.187.0 (production CDN)'));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openPage(context);
  await ready(page, '?seed=stage-v0-test&mode=manual&minutes=1');
  const originalSeats = await getData(page, 'occupied');
  assert.equal(originalSeats.split(',').length, 20);
  await shot(page, 'entry');
  await page.locator('#start-desktop').click();
  await waitData(page, 'view', 'desktop');
  assert.equal(await page.locator('#hud-time').textContent(), '1:00');
  await page.waitForTimeout(400);
  await shot(page, 'stage');

  // Pointer lock or the desktop drag fallback must rotate the actual camera.
  await page.mouse.move(685, 368);
  await page.mouse.down();
  await page.mouse.move(805, 405, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => Math.abs(Number(document.body.dataset.lookYaw)) > .02);
  await page.keyboard.press('Escape');
  console.log('D1 PASS: room rendered, desktop look-around working');

  await page.keyboard.press('d');
  await waitData(page, 'debug', 'true');
  await page.waitForFunction(() => !document.getElementById('debug-panel')?.hidden);
  const initialVolume = Number(await page.locator('#desktop-volume').inputValue());
  for (const [key, label] of [['l', 'Laugh'], ['t', 'Titter'], ['r', 'Ripple'], ['p', 'Applause'], ['c', 'Cough']]) {
    await page.keyboard.press(key);
    await waitEvent(page, label + ' · manual');
  }
  await page.waitForFunction(() => (document.getElementById('debug-text')?.textContent || '').includes('Cough · manual'));
  await page.keyboard.press('Equal');
  await waitEvent(page, 'Volume');
  assert.equal(Number(await page.locator('#desktop-volume').inputValue()), initialVolume + 5);
  await page.keyboard.press('Minus');
  assert.equal(Number(await page.locator('#desktop-volume').inputValue()), initialVolume);
  await shot(page, 'debug');
  await page.keyboard.press('d');
  await waitData(page, 'debug', 'false');
  console.log('D2 PASS: all desktop shortcuts, manual ripple, volume and overlay');

  // An actual Web Audio reaction must be scheduled; stop cancels pending
  // sources as well as voices already playing.
  await page.keyboard.press('Space');
  await waitData(page, 'state', 'running');
  await page.waitForFunction(() => Number(document.body.dataset.voices) === 0);
  await page.keyboard.press('l');
  await page.waitForFunction(() => Number(document.body.dataset.voices) > 0);
  await page.keyboard.press('Space');
  await waitData(page, 'state', 'ready');
  await page.waitForFunction(() => Number(document.body.dataset.voices) === 0);
  await page.waitForTimeout(1100);
  assert.equal(await getData(page, 'voices'), '0');
  assert.equal(await page.locator('#hud-time').textContent(), '1:00');
  console.log('D7 PASS: placeholder bank used, audible sources scheduled without sound files');
  console.log('D4 PASS: stop clears scheduled and active voices and resets the timer');
  await page.locator('#desktop-exit').click();
  await waitData(page, 'view', 'entry');

  await ready(page, '?seed=stage-v0-test&mode=manual&minutes=1');
  assert.equal(await getData(page, 'occupied'), originalSeats);
  await ready(page, '?seed=different-crowd&fill=30&mode=manual&minutes=1');
  assert.equal((await getData(page, 'occupied')).split(',').length, 30);
  const calls = Number(await getData(page, 'drawCalls')), triangles = Number(await getData(page, 'triangles'));
  console.log('30-seat desktop draw budget: ' + calls + ' calls, ' + triangles + ' triangles (not headset FPS)');
  assert.ok(calls <= 100 && triangles <= 100000, 'Desktop scene exceeds the v0 draw budget');
  await ready(page, '?seed=different-crowd&mode=manual&minutes=1');
  assert.notEqual(await getData(page, 'occupied'), originalSeats);
  console.log('D3 PASS: repeating the URL repeats occupied seats; changed seed changes them (logic tests cover throttled schedule)');
  await page.locator('#start-desktop').click();
  await waitData(page, 'view', 'desktop');
  if (!quick) {
    await page.keyboard.press('Space');
    await waitData(page, 'state', 'running');
    const started = Date.now();
    await waitData(page, 'state', 'finished', 80000);
    assert.equal(await page.locator('#hud-time').textContent(), '0:00');
    await waitEvent(page, 'Applause · finish');
    console.log('D4 PASS: real one-minute browser countdown finished in ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  } else console.log('D4 NOTE: quick run skipped the real minute; pure logic tested separately');
  assert.deepEqual(errors, [], 'Desktop browser console errors');
  await context.close();

  // Deliberately simulate the rejection browser permission denial produces,
  // so no real mic or a human clicking a browser prompt is needed.
  const denialContext = await browser.newContext({ viewport: { width: 1100, height: 730 } });
  await denialContext.addInitScript(() => {
    const testWindow = /** @type {TestWindow} */ (window);
    testWindow.stageTestRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      testWindow.stageTestRequests = (testWindow.stageTestRequests || 0) + 1;
      throw new DOMException('Test permission denied', 'NotAllowedError');
    };
  });
  const denied = await openPage(denialContext);
  await ready(denied.page, '?seed=mic-denial&mode=mic&minutes=1');
  assert.equal(await denied.page.evaluate(() => /** @type {TestWindow} */ (window).stageTestRequests), 0);
  await denied.page.locator('#mic-toggle').click();
  await denied.page.waitForFunction(() => (/** @type {HTMLSelectElement} */ (document.getElementById('reaction-mode'))).value === 'timed');
  await denied.page.locator('#start-desktop').click();
  await waitData(denied.page, 'mode', 'timed');
  await waitData(denied.page, 'micActive', 'false');
  await denied.page.keyboard.press('Space');
  await waitData(denied.page, 'state', 'running');
  await denied.page.keyboard.press('c');
  await waitEvent(denied.page, 'Cough · manual');
  assert.deepEqual(denied.errors, []);
  await denialContext.close();
  console.log('D5 PASS: simulated browser permission denial selected timed fallback; manual trigger works, no console errors');

  const micContext = await browser.newContext({ viewport: { width: 1100, height: 730 }, permissions: ['microphone'] });
  await micContext.addInitScript(() => {
    const testWindow = /** @type {TestWindow} */ (window);
    testWindow.stageTestTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      testWindow.stageTestTracks?.push(...stream.getTracks());
      return stream;
    };
    const stop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function () {
      if (testWindow.stageTestTracks?.includes(this)) {
        // Testing only: count actual stop() calls across navigation. No audio.
        sessionStorage.setItem('stage-test-stop-count', String(Number(sessionStorage.getItem('stage-test-stop-count') || 0) + 1));
      }
      stop.call(this);
    };
  });
  const fake = await openPage(micContext);
  await ready(fake.page, '?seed=mic-cleanup&mode=mic&minutes=1');
  assert.equal(await fake.page.evaluate(() => /** @type {TestWindow} */ (window).stageTestTracks?.length), 0);
  await fake.page.locator('#mic-toggle').click();
  await waitData(fake.page, 'micActive', 'true');
  await fake.page.locator('#start-desktop').click();
  await waitData(fake.page, 'mode', 'mic');
  await fake.page.keyboard.press('Space');
  await waitData(fake.page, 'state', 'running');
  await fake.page.keyboard.press('Space');
  await waitData(fake.page, 'micActive', 'false');
  assert.equal(await fake.page.evaluate(() => {
    const tracks = /** @type {TestWindow} */ (window).stageTestTracks || [];
    return tracks.length > 0 && tracks.every(track => track.readyState === 'ended');
  }), true);
  await fake.page.locator('#desktop-exit').click();
  await waitData(fake.page, 'view', 'entry');
  await fake.page.locator('#mic-toggle').click();
  await waitData(fake.page, 'micActive', 'true');
  await fake.page.goto(origin + prefix + '__clean-up-test.html');
  assert.ok(await fake.page.evaluate(() => Number(sessionStorage.getItem('stage-test-stop-count') || 0)) >= 2,
    'Page navigation did not invoke stop() on the second capture');
  assert.deepEqual(fake.errors, []);
  await micContext.close();
  console.log('D9 PASS: genuine Chromium fake-device tracks ended on stop and on page navigation');
  console.log('All desktop integration checks completed; headset acceptance remains pending.');
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(() => resolveClose(undefined)));
}
