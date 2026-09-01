/* Static checks on the Firebase wiring (prompt 06). These run without the emulator, so they
   guard the things that are easy to get wrong and expensive to notice later: an unpinned SDK
   URL, an emulator port that drifts from firebase.json, a real credential pasted into a
   public file, or a rules file that lost its deny-by-default. The behavioural proof that the
   rules work lives in test_firestore_rules.test.js and needs the emulator. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the real project config is present, and placeholders would not pass for it', () => {
  /* This assertion was inverted on 2026-09-01. It used to require isConfigured() === false,
     which was correct while the file held TODO_REPLACE_ME. The owner has since created
     project ninjanerd-32030 and the real values are in, so the guard now runs the other way:
     the shipped config must stay filled, and a regression to placeholders must fail here
     rather than surfacing as a silent no-op in the browser. */
  assert.equal(isConfigured(), true, 'the shipped config must hold real values');
  assert.equal(firebaseConfig.projectId, 'ninjanerd-32030');
  assert.doesNotMatch(JSON.stringify(firebaseConfig), /TODO_REPLACE_ME/);
  // authDomain and storageBucket are derived from the project id; a mismatch means a paste error.
  assert.equal(firebaseConfig.authDomain, `${firebaseConfig.projectId}.firebaseapp.com`);
  assert.ok(firebaseConfig.storageBucket.startsWith(`${firebaseConfig.projectId}.`));
  // The sender id is embedded in the app id; if they disagree, the values came from two projects.
  assert.ok(firebaseConfig.appId.includes(`:${firebaseConfig.messagingSenderId}:`));

  // The predicate itself still discriminates correctly.
  assert.equal(isConfigured({
    apiKey: 'a', authDomain: 'b', projectId: 'c',
    storageBucket: 'd', messagingSenderId: 'e', appId: 'f',
  }), true);
  assert.equal(isConfigured({ apiKey: 'TODO_REPLACE_ME' }), false, 'placeholders are not configured');
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
  // Legacy-schema collections still in scope must all be covered.
  for (const path of [/match \/users\/\{uid\}/, /match \/history\/\{entryId\}/,
    /match \/statistics\/\{docId\}/]) {
    assert.match(rules, path, `rules must cover ${path}`);
  }
  /* Collaboration was dropped 2026-09-01. These blocks were DELETED, not left dormant, so
     invites/chat_sessions/messages fall through to the catch-all deny. Asserting their
     absence is the point: a dormant allow would still let any signed-in user open a chat
     session against any uid and store free text in it. If the feature ever comes back this
     test is where you will find out it needs rethinking, rather than shipping UI over rules
     nobody re-reviewed. */
  for (const path of [/match \/invites\//, /match \/chat_sessions\//,
    /match \/messages\//, /resource\.data\.user1_id/, /resource\.data\.user2_id/,
    /message_content/]) {
    assert.doesNotMatch(rules, path, `collaboration is dropped; ${path} must not be back`);
  }
  // Explicit deny-all catch-all.
  assert.match(rules, /match \/\{document=\*\*\} \{\s*\n\s*allow read, write: if false;/);
});

/* The legacy Audit page reads ANOTHER user's profile, history and statistics
   (obs_app.py: db.get_user(target_username)). Owner-only rules would break it, so admins get
   cross-user READ. That is only safe while is_admin cannot be set by the client. */
test('admin can read any user, and is_admin is not client-settable', () => {
  const rules = read('dbmgr/firestore.rules');
  assert.match(rules, /function isAdmin\(\)/);
  assert.match(rules, /is_admin == true/);
  // Audit needs cross-user read on the profile and both subcollections.
  const adminReads = rules.match(/allow read: if isOwner\(uid\) \|\| isAdmin\(\)/g) || [];
  assert.ok(adminReads.length >= 3,
    `expected admin read on users, history and statistics; found ${adminReads.length}`);
  // Self-promotion guards.
  assert.match(rules, /request\.resource\.data\.is_admin == false/,
    'a new account must not be able to create itself as admin');
  assert.match(rules, /request\.resource\.data\.is_admin == resource\.data\.is_admin/,
    'is_admin must be immutable on update');
});

/* Audit treats history as a trail. The chat half of this test went with the dropped feature;
   what remains is the guarantee Audit actually depends on. */
test('history is append-only', () => {
  const rules = read('dbmgr/firestore.rules');
  assert.match(rules, /allow update, delete: if false;/, 'history entries must be immutable');
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

test('the rules file documents the data model it enforces', () => {
  /* This guard used to point at doc/firebase-setup.md, but nothing under doc/ is tracked —
     those are throw-away plans that live only on the owner's machine, so a fresh clone (and
     therefore CI) would not have the file. The model is documented in the rules file instead,
     which is a deployed artifact and cannot drift out of the repo. */
  const rules = read('dbmgr/firestore.rules');

  // Every collection the rules govern must be described, not just guarded.
  for (const path of ['users/{uid}', 'users/{uid}/history/{autoId}',
    'users/{uid}/statistics/summary']) {
    assert.ok(rules.includes(path), `rules should document the ${path} document shape`);
  }

  // The model mirrors the legacy SQLite tables, so it must say which maps to which — this is
  // what keeps Audit, Statistics and progress tracking working (obs_sqlite_manager.py).
  for (const table of ['user_history', 'user_statistics']) {
    assert.ok(rules.includes(table), `rules should map the legacy ${table} table`);
  }

  /* A legacy table that is deliberately NOT implemented has to say so in the file, or the next
     reader cannot tell "dropped on purpose" from "forgotten". user_payments and the rest were
     always listed; collaboration joined them on 2026-09-01. */
  for (const dropped of ['user_payments', 'email_verification_codes', 'invites',
    'chat_sessions', 'messages']) {
    assert.ok(rules.includes(dropped),
      `rules should record that the legacy ${dropped} table is deliberately dropped`);
  }
  assert.match(rules, /DROPPED 2026-09-01[\s\S]{0,200}collaboration/,
    'the collaboration drop must be dated and explained, not silently absent');

  // Field names that carry behaviour: renaming any of these silently breaks a page.
  for (const field of ['topic', 'subtopic', 'grade', 'last_login', 'questions_attempted',
    'topics_covered', 'created_at', 'updated_at']) {
    assert.ok(rules.includes(field), `rules should document the ${field} field`);
  }

  // statistics is the union of TWO legacy backends; documenting only the SQLite table was a
  // real error once, and it hides where questions_attempted/topics_covered come from.
  assert.match(rules, /obs_db_manager\.py/,
    'rules should record that statistics draws on the JSON store, not just SQLite');

  // Tables dropped on purpose, so a future reader does not "restore" them.
  for (const dropped of ['user_payments', 'email_verification_codes', 'schema_info']) {
    assert.ok(rules.includes(dropped), `rules should record that ${dropped} was dropped`);
  }

  // Admin is granted by hand in the console; there is deliberately no in-app path.
  assert.match(rules, /TO GRANT ADMIN/,
    'rules should say how admin is granted, since isAdmin() reads is_admin off the user doc');
});
