import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAMES, gameBySlug } from '../app/js/games-data.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'app');
// Site paths are absolute from the published root, which is app/.
const served = (p) => join(appRoot, p.replace(/^\//, ''));
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

test('manifest contains exactly the four legacy games', () => {
  assert.deepEqual(GAMES.map((g) => g.slug).sort(),
    ['geodash', 'mmh', 'tank-attack', 'tejas-thrust']);
});

test('game names and descriptions match the legacy Flask app', () => {
  // Verbatim from obs_app.py `available_games`.
  assert.equal(gameBySlug('tejas-thrust').name, 'AMCA Thrust');
  assert.equal(gameBySlug('tank-attack').name, 'Tank Attack');
  assert.equal(gameBySlug('geodash').name, 'GeoDash');
  assert.equal(gameBySlug('mmh').name, 'Zapper');
  for (const g of GAMES) assert.ok(g.description.length > 20, `${g.slug} needs a description`);
});

test('every referenced CSS and JS path exists under the published root', () => {
  for (const g of GAMES) {
    assert.ok(g.scripts.length > 0, `${g.slug} has no scripts`);
    for (const p of [...g.css, ...g.scripts]) {
      assert.ok(p.startsWith('/static/games/'), `${g.slug}: ${p} must be an absolute served path`);
      assert.ok(existsSync(served(p)), `${g.slug}: missing file ${p} (expected app${p})`);
    }
  }
});

test('image and audio assets referenced by game config exist under the published root', () => {
  // The game internals are unchanged and hardcode absolute /static/games/... paths, so the
  // tree must be copied into app/. Pull every such path straight out of the game sources.
  const seen = new Set();
  for (const g of GAMES) {
    for (const src of g.scripts) {
      const code = readFileSync(served(src), 'utf8');
      for (const m of code.matchAll(/['"](\/static\/games\/[^'"]+\.(?:png|wav|jpg|jpeg|gif|mp3|ogg))['"]/g)) {
        seen.add(m[1]);
      }
    }
  }
  assert.ok(seen.size > 0, 'expected to find asset references in the game sources');
  for (const p of seen) assert.ok(existsSync(served(p)), `missing game asset ${p} (expected app${p})`);
});

test('each game declares the globals and hooks the player page needs', () => {
  for (const g of GAMES) {
    assert.ok(g.globalName, `${g.slug} needs a globalName`);
    assert.ok(['togglePause', 'pause'].includes(g.pauseMethod), `${g.slug} pauseMethod`);
    assert.ok(['event', 'poll'].includes(g.gameOverMode), `${g.slug} gameOverMode`);
    assert.ok(Array.isArray(g.controls) && g.controls.length > 0, `${g.slug} needs controls`);
    // The constructor the player page instantiates must actually be defined by the sources.
    const code = g.scripts.map((s) => readFileSync(served(s), 'utf8')).join('\n');
    assert.match(code, new RegExp(`class\\s+${g.globalName}\\b`), `${g.slug}: ${g.globalName} not defined`);
    // And the pause method it calls must exist.
    assert.match(code, new RegExp(`\\b${g.pauseMethod}\\s*\\(`), `${g.slug}: ${g.pauseMethod}() not found`);
    // The player page calls start() on Start and stop() before restarting.
    assert.match(code, /^\s*start\s*\(/m, `${g.slug}: start() not found`);
    assert.match(code, /^\s*stop\s*\(/m, `${g.slug}: stop() not found`);
    // Every game is constructed as new Ctor('gameCanvas').
    assert.match(code, /constructor\s*\(\s*canvas/, `${g.slug}: constructor(canvasId) not found`);
  }
});

test('script order is preserved from the legacy template (config first, game.js last)', () => {
  for (const g of GAMES) {
    assert.match(g.scripts[0], /\/config\.js$/, `${g.slug}: config.js must load first`);
    assert.match(g.scripts[g.scripts.length - 1], /\/game\.js$/, `${g.slug}: game.js must load last`);
  }
});

/* Regression: the player page must NOT resolve a game class via `window[name]`.

   These are classic scripts, and a top-level `class X {}` binds in the global LEXICAL scope
   rather than becoming a property of the global object. Running the real sources in a vm
   context proves it: `globalThis.GeoDash` is undefined while the bare identifier resolves.
   Getting this wrong made every game fail with "failed to load. Please refresh the page." */
test('game classes bind lexically, not onto window (why globalCtor exists)', async () => {
  const vm = await import('node:vm');
  for (const g of GAMES) {
    // Minimal DOM stub: some sources register listeners at top level (e.g. geodash's
    // DOMContentLoaded hook). We only need the class declarations to be evaluated.
    const noop = () => {};
    const context = vm.createContext({
      console,
      window: { addEventListener: noop, removeEventListener: noop },
      document: { addEventListener: noop, removeEventListener: noop, getElementById: () => null },
    });
    for (const src of g.scripts) {
      vm.runInContext(readFileSync(served(src), 'utf8'), context, { filename: src });
    }
    assert.equal(
      vm.runInContext(`typeof globalThis[${JSON.stringify(g.globalName)}]`, context),
      'undefined',
      `${g.slug}: window[...] lookup would break; game.js must not use it`,
    );
    // The strategy game.js actually uses: evaluate the identifier in global scope.
    assert.equal(
      vm.runInContext(`typeof ${g.globalName} === 'function' ? ${g.globalName} : null`, context)
        && 'function',
      'function',
      `${g.slug}: ${g.globalName} should resolve as a global lexical binding`,
    );
  }
});

test('player page resolves constructors by identifier, not off window', () => {
  const src = read('app/js/game.js');
  assert.doesNotMatch(src, /window\[\s*meta\.globalName\s*\]/,
    'window[globalName] is always undefined for these classic-script classes');
  assert.match(src, /function globalCtor\(/);
});

test('games list and player pages exist and wire up their scripts', () => {
  const list = read('app/pages/games.html');
  assert.match(list, /id="nn-games-grid"/);
  assert.match(list, /\/js\/games\.js/);
  assert.match(list, /fa-gamepad/);
  assert.match(list, /Back to Topics/);

  const player = read('app/pages/game.html');
  assert.match(player, /id="gameCanvas"[^>]*width="1200"[^>]*height="800"/);
  assert.match(player, /id="startBtn"/);
  assert.match(player, /id="restartBtn"/);
  assert.match(player, /id="pauseBtn"/);
  assert.match(player, /Back to Games/);
  assert.match(player, /\/js\/game\.js/);
});

test('topics page links to the games list', () => {
  assert.match(read('app/js/topics.js'), /\/pages\/games\.html\?grade=/);
});

test('legacy game templates are retired via obs_', () => {
  // During the migration nothing is deleted; superseded files get an obs_ prefix. After the
  // post-deploy obs_ purge (release runbook step 6) the whole tree is gone, which is also
  // valid -- so assert only that an UN-prefixed legacy template never comes back.
  assert.ok(!existsSync(join(repoRoot, 'obs_templates/games/games_list.html')),
    'games_list.html should be retired to obs_games_list.html');
  assert.ok(!existsSync(join(repoRoot, 'obs_templates/games/game_detail.html')),
    'game_detail.html should be retired to obs_game_detail.html');

  const purged = !existsSync(join(repoRoot, 'obs_templates'));
  if (!purged) {
    assert.ok(existsSync(join(repoRoot, 'obs_templates/games/obs_games_list.html')));
    assert.ok(existsSync(join(repoRoot, 'obs_templates/games/obs_game_detail.html')));
  }
});
