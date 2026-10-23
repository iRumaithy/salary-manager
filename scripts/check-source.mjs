import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('public/index.html','utf8');
for(const [,code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(code.replace(/^\s*import .*;\s*$/gm,''));
}
const release=readFileSync('src/worker.js','utf8').match(/const RELEASE_ID = "([^"]+)"/)[1];
assert(html.includes('var APP_RELEASE_ID = "'+release+'";'));
assert(readFileSync('public/sw.js','utf8').includes('salary-manager-v'+release));
assert(!readFileSync('.github/workflows/pages.yml','utf8').includes('  push:'));
const core=readFileSync('public/finance-core-v3.10.0.js','utf8').replace(/export /g,'');
assert(html.includes(core),'Embedded accounting must match the Worker accounting source');
assert(html.includes(readFileSync('public/experience-v3.10.0.css','utf8')),'Embedded design must match its source');
console.log('Inline JavaScript, release identifiers and owner-only publication checks passed.');
