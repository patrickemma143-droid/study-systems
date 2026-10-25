// Copies the text-recognition (OCR) engine into public/ocr so it is served from our own site:
// no outside CDN, works with the security policy, and students' scans never leave their device.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = path.resolve('public/ocr');
fs.mkdirSync(path.join(out, 'lang'), { recursive: true });
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const files = [
  [path.join(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  [path.join(pkgDir('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [path.join(pkgDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [path.join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz'), 'lang/eng.traineddata.gz'],
];
for (const [from, to] of files) fs.copyFileSync(from, path.join(out, to));
console.log('OCR engine copied to public/ocr');

// The 3D anatomy models are Draco-compressed: serve three.js's decoder from our own site too.
const draco = path.resolve('public/draco');
fs.mkdirSync(draco, { recursive: true });
for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) fs.copyFileSync(path.resolve('node_modules/three/examples/jsm/libs/draco/gltf', f), path.join(draco, f));
console.log('Draco decoder copied to public/draco');
