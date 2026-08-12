#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import child_process from 'child_process';
import axe from 'axe-core';

const args = process.argv.slice(2);
const serve = args.includes('--serve');
const port = 5174;
const host = '127.0.0.1';
const base = `http://${host}:${port}`;

async function waitFor(url, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {}
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

let serverProc;
try {
  if (serve) {
    console.log('Attempting `vite preview` on port', port);
    serverProc = child_process.spawn('npx', ['vite', 'preview', '--port', String(port)], { shell: true, stdio: 'inherit' });
    try {
      await waitFor(base + '/', 8000);
    } catch (e) {
      console.warn('`vite preview` did not start in time — falling back to `serve -s dist`');
      if (serverProc) serverProc.kill();
      serverProc = child_process.spawn('npx', ['serve', '-s', 'dist', '-l', String(port)], { shell: true, stdio: 'inherit' });
      await waitFor(base + '/', 10000);
    }
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const routes = ['/', '/search', '/create-journey', '/profile', '/login'];
  const reports = {};
  await fs.mkdir('accessibility', { recursive: true });
  await fs.mkdir('screenshots', { recursive: true });

  for (const route of routes) {
    const url = route === '/' ? base + '/' : base + route;
    console.log('Visiting', url);
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.stack || String(err) }));
    page.on('requestfailed', req => consoleLogs.push({ type: 'requestfailed', url: req.url(), failure: req.failure() ? req.failure().errorText : null }));

    await page.goto(url, { waitUntil: 'networkidle' });
    // inject axe
    await page.addScriptTag({ content: axe.source });
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    });
    const safeName = route.replace(/\//g, '') || 'home';
    const consolePath = path.join('accessibility', `console-${safeName}.json`);
    await fs.writeFile(consolePath, JSON.stringify(consoleLogs, null, 2));
    const reportPath = path.join('accessibility', `axe-${safeName}.json`);
    await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
    const screenshotPath = path.join('screenshots', `${safeName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    reports[route] = { report: reportPath, screenshot: screenshotPath, violationsCount: result.violations.length };
  }

  await browser.close();
  await fs.writeFile('accessibility/summary.json', JSON.stringify(reports, null, 2));
  console.log('Done. Reports written to accessibility/ and screenshots/');
} catch (err) {
  console.error('Audit failed:', err);
  process.exitCode = 1;
} finally {
  if (serverProc) serverProc.kill();
}
