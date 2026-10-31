# Frozen GREEN baseline

Captured **2026-10-30** on branch `ninjanerd-static`, at `7c00774` plus the uncommitted
Programming topic of the same day.

`/fix-or-ferment` steps 2 and 5 compare against this file. **Update it deliberately**, as
part of a change that legitimately moves a number — never to make a red run look green.

---

## 1. `npm test`

```
ℹ tests 414
ℹ suites 1
ℹ pass 414
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

27 test files. `suites 1` is the `describe('firestore security rules', { skip })` block —
its 20 cases are not counted locally. The TAP name capture yields **415** lines because the
skipped suite emits its own `ok`; that is expected and does not indicate a 415th test.

**GREEN = `fail 0` and `pass == tests`.** Report `skipped`/`todo` whenever either is
non-zero — a feature verified only by a skipped test is not verified.

## 2. `npm run check:content`

```
Checked 4175 items.

No findings.
```

Exit code is meaningful: **1** on any finding, **0** when clean. **GREEN = `No findings.`**

## 3. `npm run check:arithmetic`

```
items 4175 | statements checked 1030 | skipped as unevaluable 50 | unevaluable regions 113 | WRONG 0
```

Exit code is meaningful **as of 2026-10-30**: **1** on any wrong statement, **0** when clean.
**GREEN = `WRONG 0` and exit 0.**

It was reporting-only before that date and never set an exit code at all, while printing
`WRONG 31` over 30 ids. This file used to carry those 30 ids as an allowlist and step 2 diffed
against it. **That allowlist is gone** — the five classes of statement the evaluator cannot read
are now classified unevaluable inside the tool, so there is nothing to maintain here and any
flagged id is a real finding. CLAUDE.md §12a records the five classes, and why a whitelist was
the wrong fix even when it would have worked.

**Check `statements checked` too, not just `WRONG`.** A run reporting `WRONG 0` on a collapsed
`checked` count has stopped looking rather than passed — the cheapest way to make this gate
green forever is to skip every statement. `test_arithmetic.test.js` asserts the floor
(`checked > 1000`) for the same reason. The figure moved 1,083 → 1,030 when the classifier
landed; those 53 are the genuinely unevaluable ones.

## 4. Not run locally

| Suite | Status |
|---|---|
| `test_firestore_rules.test.js` (20 cases) | Skips as a suite. The Firestore emulator does not work on this machine — REST hangs, gRPC resets; two emulator jars, two JDKs, the sandbox, `demo-` ids and proxy config were all ruled out. **Do not retry it locally** (CLAUDE.md §12). Verified in CI by `.github/workflows/rules.yml`, which sets `NN_REQUIRE_EMULATOR=1` so a skip becomes a hard failure. |
| `npm run build:content` | **Deliberately not part of the gate.** It rewrites tracked files under `app/content/` and depends on `doc/questionnaire/` (git-ignored; 191 files present locally, absent on a fresh clone). Owner decision, 2026-10-30: the gate stays non-mutating. |

---

## 5. Context: what the suite does and does not prove

Recorded here so a `/fix-or-ferment` run does not mistake a green suite for a verified
change. From the 2026-10-30 audit:

- **11 of 30 `app/js` modules are ever loaded by a test.** The other 19 execute zero lines,
  including `practice.js`, `learn.js`, `lesson.js`, `data.js`, `auth.js`, `topics.js`,
  `explore.js`, `statistics.js` and all three classic scripts.
- **491 of 1,078 assertions (46%) are `assert.match` against file text.** Correct for static
  facts; blind to behaviour.
- **Mutation score 17/30.** Survivors included inverting `practice.js` scoring so every
  correct answer is marked wrong, deleting `score++`, neutering the `emailVerified` gate,
  swapping `attempts_by`/`correct_by`, and recording mastery on wrong answers — each passing
  all 357 tests.
- **`npm test` does not run in CI.** `pages.yml` deploys on push to `ninjanerd-static` with
  no test step; `rules.yml` runs only the rules file, and only on rules-related paths. The
  suite is a local gate, which is precisely why this skill runs it on both sides of a change.

Genuinely strong by execution: the 4,175-item corpus walk, `tools/lib/*` (parse 99%,
subtopic-map 100%), the Control Logic and Electrical Design lessons via `vm` against a
recording canvas, and the 20 emulator rules cases in CI.
