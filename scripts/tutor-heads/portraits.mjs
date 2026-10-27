// Renders public/tutors/<id>.webp from the 3D models, through the app's own /tutor-portrait page.
// Start the built app first (npm run build && npm start), then: node scripts/tutor-heads/portraits.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { TUTORS } from '../../shared/tutors.ts';

const base = process.env.BASE || 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
for (const t of TUTORS) {
  await page.goto(`${base}/tutor-portrait/${t.id}`);
  await page.waitForFunction(() => document.title === 'portrait-ready', null, { timeout: 90000 });
  const png = `public/tutors/${t.id}.png`;
  await page.locator('.tutor-avatar').screenshot({ path: png, omitBackground: true });
  execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${png}').convert('RGBA').resize((256,256), Image.LANCZOS); im.save('public/tutors/${t.id}.webp','WEBP',quality=84,method=6)`]);
  execFileSync('rm', [png]);
  console.log('portrait', t.id);
}
await browser.close();
