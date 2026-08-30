/* Static checks on the Firebase wiring (prompt 06). These run without the emulator, so they
   guard the things that are easy to get wrong and expensive to notice later: an unpinned SDK
   URL, an emulator port that drifts from firebase.json, a real credential pasted into a
   public file, or a rules file that lost its deny-by-default. The behavioural proof that the
   rules work lives in test_firestore_rules.test.js and needs the emulator. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { firebaseConfig, isConfigured } from '../app/js/firebase-config.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

test('firebase config exposes the expected keys', () => {
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
    assert.ok(k in firebaseConfig, `missing config key ${k}`);
  }
});

test('isConfigured is false while placeholders remain, true once filled', () => {
  assert.equal(isConfigured(), false, 'placeholders should not count as configured');
  assert.equal(isConfigured({
    apiKey: 'a', authDomain: 'b', projectId: 'c',
    storageBucket: 'd', messagingSenderId: 'e', appId: 'f',
  }), true);
  assert.equal(isConfigured({ apiKey: '', authDomain: 'b' }), false, 'empty values are not configured');
});

// app/ is published, so anything private in it is published too.
test('no service-account or private key material sits in app/js', () => {
  const cfg = read('app/js/firebase-config.js');
  assert.doesNotMatch(cfg, /BEGIN [A-Z ]*PRIVATE KEY/);
  assert.doesNotMatch(cfg, /service_account|client_email|private_key_id/);
  assert.match(cfg, /NOT A SECRET/i, 'the public-by-design caveat should stay in the file');
});

test('firebase-init pins an exact SDK version rather than tracking latest', () => {
  const init = read('app/js/firebase-init.js');
  const urls = [...init.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/([^/]+)\//g)].map((m) => m[1]);
  assert.ok(urls.length >= 3, 'expected app, auth and firestore imports');
  for (const v of urls) {
    assert.match(v, /^\d+\.\d+\.\d+$/, `SDK URL must pin an exact version, got "${v}"`);
  }
  assert.equal(new Set(urls).size, 1, 'all Firebase modules must use the same SDK version');
});

test('the emulator switch is guarded on localhost only', () => {
  const init = read('app/js/firebase-init.js');
  assert.match(init, /connectAuthEmulator/);
  assert.match(init, /connectFirestoreEmulator/);
  assert.match(init, /isLocalhost/);
  assert.match(init, /'localhost'|"localhost"/);
  assert.match(init, /127\.0\.0\.1/);
});

test('emulator ports in firebase-init match firebase.json', () => {
  const cfg = JSON.parse(read('firebase.json'));
  const init = read('app/js/firebase-init.js');
  const declared = /EMULATOR_PORTS = \{ auth: (\d+), firestore: (\d+) \}/.exec(init);
  assert.ok(declared, 'firebase-init should declare EMULATOR_PORTS');
  assert.equal(Number(declared[1]), cfg.emulators.auth.port, 'auth port drift');
  assert.equal(Number(declared[2]), cfg.emulators.firestore.port, 'firestore port drift');
});

test('firestore.rules locks down user data and defaults to deny', () => {
  const rules = read('dbmgr/firestore.rules');
  assert.match(rules, /rules_version = '2'/);
  // Owner-only access to per-user data.
  assert.match(rules, /function isOwner\(uid\)/);
  assert.match(rules, /request\.auth\.uid == uid/);
  // Subcollections must be covered, not just the parent doc.
  assert.match(rules, /match \/\{subcollection\}\/\{docId\}/);
  // Collaboration is participant-scoped.
  assert.match(rules, /request\.auth\.uid in resource\.data\.participants/);
  // Messages cannot be rewritten.
  assert.match(rules, /allow update, delete: if false/);
  // Explicit deny-all catch-all.
  assert.match(rules, /match \/\{document=\*\*\} \{\s*\n\s*allow read, write: if false;/);
});

test('rules never grant blanket access', () => {
  const rules = read('dbmgr/firestore.rules');
  // A bare `allow read, write: if true` would defeat everything above.
  assert.doesNotMatch(rules, /allow\s+(read|write|read, write)\s*:\s*if\s+true\s*;/);
  assert.doesNotMatch(rules, /allow\s+(read|write|read, write)\s*;/, 'unconditional allow');
});

test('firebase.json and indexes exist and emulator config is complete', () => {
  const cfg = JSON.parse(read('firebase.json'));
  assert.equal(cfg.firestore.rules, 'dbmgr/firestore.rules');
  assert.equal(cfg.firestore.indexes, 'dbmgr/firestore.indexes.json');
  assert.ok(cfg.emulators.auth.port && cfg.emulators.firestore.port);
  const idx = JSON.parse(read('dbmgr/firestore.indexes.json'));
  assert.ok(Array.isArray(idx.indexes), 'indexes must be an array (empty is fine to start)');
});

test('npm scripts for the emulator and rules tests exist', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.emulator, /emulators:start/);
  assert.match(pkg.scripts['test:rules'], /test_firestore_rules/);
  assert.ok(pkg.devDependencies['@firebase/rules-unit-testing']);
  assert.ok(pkg.devDependencies['firebase-tools']);
});

test('the owner setup doc exists and covers the do-once console steps', () => {
  assert.ok(existsSync(join(repoRoot, 'doc/firebase-setup.md')));
  const d = read('doc/firebase-setup.md');
  for (const needle of [/Email\/Password/i, /Authorized domains/i, /ninjanerd\.ai/, /localhost/,
    /production mode/i, /PUBLIC, not a secret/i, /users\/\{uid\}/, /collaboration\/\{roomId\}/]) {
    assert.match(d, needle, `setup doc should mention ${needle}`);
  }
});
