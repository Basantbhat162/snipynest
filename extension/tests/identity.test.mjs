import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('native host allowlist matches the Companion public manifest key',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
  const id=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).split('').map(hex=>String.fromCharCode(97+parseInt(hex,16))).join('');
  assert.equal(readFileSync(new URL('../../src-tauri/src/companion_id.txt',import.meta.url),'utf8').trim(),id);
  assert.ok(manifest.optional_permissions.includes('nativeMessaging'));
  assert.ok(manifest.optional_host_permissions.includes('<all_urls>'));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
});
