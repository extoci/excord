import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const stage = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(stage)) throw new Error('Expected before or after');
const browser = await chromium.launch({executablePath:process.env.EXCORD_SCREENSHOT_BROWSER, args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:960,height:1000}});
await context.route(/https?:\/\//, route=>route.abort());
const page = await context.newPage();
try {
 await page.goto(pathToFileURL(resolve(`test-results/settings/${stage}.html`)).href);
 for(const [name,label] of [['plugins','Local plugins'],['performance','Performance'],['compatibility',stage==='before'?'Compatibility':'About & support']]) {
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('main').screenshot({path:`test-results/settings/${stage}-${name}.png`});
 }
 if (stage !== 'before') {
  await page.getByRole('button',{name:'Local plugins',exact:true}).click();
  await page.getByRole('button',{name:'New plugin',exact:true}).click();
  await page.getByLabel('Plugin folder name').fill('my-first-plugin');
  await page.locator('main').screenshot({path:`test-results/settings/${stage}-create.png`});
  await page.getByRole('button',{name:'Create plugin',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Created my-first-plugin'}).waitFor();
  await page.goto(pathToFileURL(resolve(`test-results/settings/${stage}.html`)).href + '?scenario=error');
  await page.getByRole('button',{name:'Retry loading plugins'}).click();
  await page.getByText('No local plugins yet').waitFor();
  await page.goto(pathToFileURL(resolve(`test-results/settings/${stage}.html`)).href + '?scenario=populated');
  await page.setViewportSize({width:390,height:844});
  for(const label of ['Local plugins','Performance','About & support']) {
   await page.getByRole('button',{name:label,exact:true}).click();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   if(overflow) throw new Error(`Horizontal overflow on ${label}`);
  }
  await page.locator('main').screenshot({path:`test-results/settings/${stage}-mobile.png`});
 }
 console.log('Captured' ,stage,'settings using local fixtures with HTTP(S) blocked');
} finally {await browser.close();}
