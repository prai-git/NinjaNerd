---
name: fix-or-ferment
description: >
  The change-control workflow for the NinjaNerd static site. Use this skill for ANY
  request to fix a bug/issue, edit or update an existing feature, or add a new feature
  in this workspace — "fix", "edit", "update", "change", "add", "implement", "it's
  broken", "regression". It confirms the branch, establishes a GREEN baseline, studies
  the actual implementation before touching it, implements with tests that exercise real
  code, re-proves GREEN, syncs the documents, and reports a before/after evidence table.
  It never invents behaviour and never performs an outward action (commit, push, deploy,
  settings) without asking at the moment it is reached. Invoke with /fix-or-ferment.
author: Praveen Rai
---

# fix-or-ferment — change control for NinjaNerd

**Author: Praveen Rai.** Workspace: `/Users/praveenrai/Personal/Krishang/NinjaNerd`.

> **Ferment, don't flail.** The name is the contract: a change is *cultured* — baseline
> first, understanding second, implementation third, re-proof fourth. A fix that lands
> without a green baseline on both sides of it is not a fix, it is a guess that compiled.

This skill governs every fix, update and new feature. It does not *author* questions itself —
when the ask is to add questions or add a grade it **invokes `/gen-quest`** for the authoring
and keeps the gates, the build and the evidence around it (§4a). Reviewing a diff for defects
is `/code-review`.

---

## 0. Operating mode, model and effort

| Work | Who does it | Why |
|---|---|---|
| Steps 1, 3, 4, 6, 7 — branch decision, understanding the ask, implementation, doc sync, the summary | **Opus 5, high effort**, in the main session | These are judgment. They need the whole conversation, the working rules and the real code in one head. |
| Steps 2 and 5 — running the gates | **Haiku 4.5 subagents, launched in parallel** | Mechanical command execution. Keeps multi-thousand-line test output out of the main context. |

**Launch the gate subagents in ONE message so they run in parallel** (three of them —
see §2). Use the `Agent` tool with `model: "haiku"`.

**Every subagent returns raw evidence, never a verdict.** A subagent that says "all
green" has reported nothing. The main session re-derives green/red from the numbers
itself — see the verification contract in §2. This is not ceremony: until 2026-10-30
`npm run check:arithmetic` printed `WRONG 31` and **exited 0**, so an exit-code-only check
reported a corpus with 31 flagged statements as a clean pass. That tool is now a real gate —
but the habit is the point, because the next tool that lies about its exit code will not
announce itself.

### Two modes

- **Default — pause-and-show.** Stop after each step. Show the highlighted file list and
  the actual command output, then wait for confirmation before the next step.
- **Autonomous — only when the user explicitly asks for it** ("do all the steps and give
  me the summary", "run it end to end"). Steps 1–7 run without per-step pauses.
  Step 1's branch question is still asked — it decides *where the work lands*.

**Autonomous mode NEVER authorises an outward action.** Commit, push, `firebase deploy`
and GitHub settings changes always stop and ask at the moment they are reached, in both
modes. The skill ends with the summary table plus an explicit request:

> Work complete and GREEN. May I commit to `ninjanerd-static`? `main` is untouched.

---

## 1. Confirm the branch

```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
```

Then **ask the user**, every run, even when already on the right branch:

> Currently on `<branch>`. Shall I make these changes on `ninjanerd-static`, or do you
> want a different branch?

Rules that bind this step, no exceptions:

- **`ninjanerd-static` is the only branch that is ever modified**, unless the user names a
  different branch in *this* request. A branch named in an earlier session does not carry over.
- **Never create, check out, cherry-pick to, or push any other branch** on your own initiative.
- **Nothing is ever merged to `main`.** No merge, rebase, fast-forward, PR, or direct push.
  `main` holds the legacy Flask app and stays frozen until the owner personally decides otherwise.
- If `HEAD` is not `ninjanerd-static`, **stop and report it.** Do not switch to fix it —
  being on the wrong branch is a fact the owner needs to see, not a problem to tidy away.
- If `git status` is dirty, show the dirty files and ask before proceeding. Pre-existing
  uncommitted work must never be swept into this change.

---

## 2. Establish the GREEN baseline

Record this **before touching a single file**. A baseline captured after an edit proves nothing.

Launch three Haiku subagents **in one message**:

| # | Command | Exit code meaningful? | What the subagent must return verbatim |
|---|---|---|---|
| 1 | `npm test --silent 2>&1 \| tail -20` | **Yes** (`node --test` exits non-zero on failure) | The `ℹ tests / pass / fail / skipped / todo` block, and the name of every failing test |
| 2 | `npm run check:content --silent` | **Yes** (exit 1 on findings) | The `Checked N items.` line and the full findings list, or `No findings.` |
| 3 | `npm run check:arithmetic --silent` | **Yes**, since 2026-10-30 (exit 1 on any wrong statement) | The `items … \| statements checked … \| skipped … \| unevaluable regions … \| WRONG n` header line, the exit code, and every flagged item id |

Also capture the regression-evidence snapshot in the main session (cheap, and step 5
needs it):

```bash
node --test --test-reporter=tap 2>/dev/null | grep -E "^ok |^not ok " \
  | sed -E 's/^(not )?ok [0-9]+ - //' | sort > /tmp/nn-baseline-tests.txt
wc -l < /tmp/nn-baseline-tests.txt
```

### Verification contract — what the main session asserts

Do not accept a subagent's conclusion. Re-derive each from the returned numbers:

1. **Tests:** `fail == 0` **and** `pass == tests`. A run with `skipped > 0` or `todo > 0`
   is *not* automatically red, but **report the counts** — a feature "verified" by a
   skipped test is not verified. Reference: `377 pass / 0 fail / 0 skipped / 0 todo`
   across 26 files as of 2026-10-30.
2. **Content:** `No findings.` over `Checked 4175 items.` Any finding is RED.
3. **Arithmetic:** `WRONG 0` and exit 0. The frozen 30-id allowlist is **gone** — as of
   2026-10-30 the five classes of statement the evaluator cannot read are classified
   unevaluable inside the tool, so any flagged id is a real finding. Still check the
   `statements checked` figure against `reference/baseline.md`: a run that reports `WRONG 0`
   on a collapsed `checked` count has stopped looking rather than passed. CLAUDE.md §12a
   records the five classes and why a whitelist was the wrong fix.
4. If the three subagents disagree with each other or with these references, **re-run the
   disputed command yourself in the main session** before believing either.

**If the baseline is RED, stop.** Report it and ask how to proceed. Never build a change
on a broken baseline — you lose the only evidence that distinguishes your regression from
one that was already there.

The firestore rules suite (20 cases) **cannot run locally** — the emulator does not work on
this machine, and CLAUDE.md §12 records that two jars, two JDKs, the sandbox, `demo-` ids
and proxy config were all ruled out. **Do not retry it.** It skips as a suite and is
verified in CI by `.github/workflows/rules.yml`. If the change touches
`dbmgr/firestore.rules`, say so in the summary and note that CI is the gate.

---

## 3. Understand the ask against the real implementation

**This is the step that prevents invention, and it is the one most often skipped.**

Read the actual code before forming any plan. Not the documentation about the code — the code.

1. **Locate the real behaviour.** Grep/read the implicated modules and cite them as
   `file.js:line` in what you report back. If the request names a symptom ("grade 7 maths
   repeats itself"), find the mechanism before proposing anything.
2. **Check `CLAUDE.md` for a recorded decision on this exact ground.** It is the design
   record, and many apparent bugs are documented deliberate choices — the 25-question
   floor, App Check being off, the 200 items without explanations, strand-level grade-7
   TEKS codes, the two known duplicate grade-6 buckets. Changing one of those is a
   decision for the owner, not a fix.
3. **Mirror the legacy Flask app; do not invent.** This covers layout, flow, copy, icons
   **and data shapes**. The tree was deleted on 2026-09-01 — read it with
   `git show 104c466:<path>`, list it with `git ls-tree -r 104c466`. For schema or storage
   questions the authoritative legacy sources are `dbmgr/obs_sqlite_manager.py` (tables)
   and `obs_app.py` (the routes that consume them). The current schema of record is the
   header of `dbmgr/firestore.rules`.
4. **Ask when the answer is not derivable.** Use `AskUserQuestion` for genuine decision
   forks — two readings that lead to materially different work, or a static-platform
   constraint (no server, no runtime LLM, no directory listing) that forces a divergence.
   Do not guess, and do not quietly pick one and carry on.
5. **Restate the ask before implementing** (in pause-and-show mode, this is a checkpoint):
   what changes, what does not, which files, and what the test will prove.

### Is this a content ask? Route it to `/gen-quest`

Decide this at step 3, because it changes what step 4 does. The ask is **content**, not code,
when it is any of:

- "add more questions" to a grade, subject or subtopic — including "this bucket is thin"
- "add grade N" (see the grade-addition checklist in §4a — content is the bulk of it)
- "the questions repeat themselves" / "it asks the same thing five times" — a **variety**
  failure is an authoring problem, never a code fix
- a subtopic rendering greyed out and unclickable — that means *empty bucket*, so the answer
  is to author questions, never to re-route the subtopic

**Do not hand-write questions in this skill.** `/gen-quest` owns the authoring contract —
filename regex, section headings, option shape, answer-line format, TEKS anchoring and
medium-to-high difficulty. Duplicating any of that here would be two sources of truth for a
contract the build parses byte-exactly. Go to §4a.

A request that *looks* like content but is really code — the practice counter reading wrong,
a passage not displaying, maths rendering as red source text — stays in this skill. The test
is whether the fix lands in `doc/questionnaire/` (content) or `app/`/`tools/` (code).

### Invariants a change must not quietly break

Check the request against these before writing code. If it requires breaking one, **stop
and say so** — it is an owner decision:

- **The subtopic taxonomy is fixed** (legacy `SUBTOPICS`, AST-generated into
  `app/js/subtopics-data.js`). Never rename, merge or re-route a subtopic to close a
  content gap — author the questions instead. Control Logic and Electrical Design lessons
  are never added to it.
- **No root-absolute paths under `app/`.** Every same-origin path omits the leading slash,
  including `fetch()`, `location.href` and dynamically-built `src`/`href`. Every served page
  keeps its `<base>` tag ahead of any `<link>`/`<script>`. `test_base_path.test.js` enforces this.
- **Lesson scripts are CLASSIC scripts, not ES modules.** An `export` breaks `lesson.js`'s
  global-binding resolution *silently*.
- **Control Logic and Electrical Design write nothing** — no Firestore, no progress, no
  rules change, nothing scored.
- **The roll-up key cap (21 = 7 grades × 3 topics) must rise with the grade range**, and a
  grade addition always needs a rules deploy or every answer at the new grade is rejected
  `permission-denied`.
- **Standards annotations (TEKS/STAAR/MAP/NWEA) must never reach a child.** The stripping
  rule in `parse.mjs` is deliberately narrow — **do not widen it without diffing the whole
  corpus before and after**; a previous widening leaked `TEKS 6.8C / 6.8D` into 40 explanations.
- **Keep the ~40 legacy citations** in `app/js/` and `test/`. They are the evidence a
  constant was sourced rather than invented.
- **Secrets stay out.** Firebase web config and EmailJS public IDs are public by design;
  `run_app.sh` is git-ignored and holds real secrets — never commit or copy it.

---

## 4. Implement, with tests that exercise actual code

Work the **do-verify loop**: make the smallest coherent change, run the affected test file,
read the output, correct, repeat. Do not batch a large edit and run the suite once at the end.

### The test rule

> **A test must execute the implementation.** `assert.match(sourceText, /regex/)` is the
> right tool for a *static fact* — a pinned CDN version, a `<base>` tag, a legal string,
> the absence of a root-absolute path. It is the **wrong** tool for behaviour, and a
> behaviour "covered" only that way is not covered at all.

This is measured, not theoretical. A 2026-10-30 audit of this repo mutated the
implementation and re-ran all 357 tests: inverting `practice.js` scoring so **every correct
answer is marked wrong** passed all 357. So did deleting `score++`, neutering the
`emailVerified` gate in `auth.js`, swapping `attempts_by`/`correct_by` in `data.js`, and
recording mastery on wrong answers. Each of those modules is asserted only as source text.
46% of the suite's 1,078 assertions are source regexes.

So, when the change touches behaviour:

1. **Prefer an import-free pure module.** Node cannot `import()` an `https://` URL, which is
   why `stats-calc.js`, `idle-core.js`, `quiz.js` and `content-loader.js` exist separately
   from the files that wire them up. Extend that pattern — do not accept untestability as
   given. Page modules (`practice.js`, `learn.js`, `lesson.js`, `topics.js`, `subtopics.js`,
   `explore.js`, `games.js`, `game.js`) export **nothing** and wrap all logic in a
   `DOMContentLoaded` closure; none has a CDN dependency, so each is untestable purely by
   structure. If the change lands in one, extract the logic you are touching into a pure
   sibling and test that.
2. **Classic lesson scripts are tested by execution via `vm.runInContext`** against a
   recording canvas proxy that rejects non-finite coordinates. Follow
   `test_control_logic.test.js` / `test_electrical_design.test.js`. Canvas code fails
   quietly — `NaN` coordinates draw nothing and throw nothing.
3. **Arithmetic and physics are asserted against the arithmetic**, never against a copied
   table. A confidently-taught wrong truth table is the worst outcome this project can produce.
4. **No test touches the network.** OpenAI and EmailJS are mocked.

### Prove the new test can fail

A test that passes against a broken implementation is worse than no test — it is a false
guarantee. After writing it, verify it actually bites:

```bash
# in the WORKING TREE, deliberately and temporarily
git diff --stat                      # note the clean starting point
# ...break the implementation the new test targets...
node --test test/<the-new-file>.test.js    # MUST fail, and for the right reason
git checkout -- <the-broken-file>          # restore
git diff -- <the-broken-file>              # MUST be empty
node --test test/<the-new-file>.test.js    # MUST pass again
```

If a mutation cannot be reverted cleanly, do the mutation in a scratchpad copy of the repo
instead. **Never leave a deliberate mutation in the working tree** — confirm with `git diff`
before moving on, and report the mutation and its revert in the summary.

### While implementing

- **Match the surrounding code** — comment density, naming, idiom. These files carry dense
  explanatory comments recording *why*; keep writing them.
- **Never delete a file without explicit confirmation.** Temporary files *you* created are
  yours to clean up.
- **Flag any forced divergence in a comment** at the point of divergence, rather than
  quietly choosing something.

---

## 4a. Content work — delegate to `/gen-quest`

When step 3 routed here, **invoke `/gen-quest`** (`Skill` tool, `skill: "gen-quest"`) for the
authoring itself, then come back and finish steps 5–7 normally. `/gen-quest` is the authority
on the authoring contract; this section is only the wiring around it.

### Hand-off rules

- **Let `/gen-quest` ask its own questions.** It requires output target, grade, test type
  (STAAR/MAP), subject, and the MAP phase when MAP — and it explicitly refuses to default any
  of them. Pass through whatever the user already said; **never pre-answer the rest on their
  behalf**, and never guess a grade.
- **The output target is always "NinjaNerd site content"**, never a printable worksheet, when
  the ask came through this skill. That makes every item **multiple choice with four options**
  — the app marks client-side and cannot score free response.
- **Difficulty is medium-to-high** by `/gen-quest`'s own rule. Do not ask for it to be relaxed
  unless the user does.
- **The pair always lands in `doc/questionnaire/`**, and nowhere else. That is the only
  directory `tools/build-content.mjs:19` reads (`join(repoRoot, 'doc', 'questionnaire')`), so a
  pair written anywhere else is invisible to the build no matter how correct its contents are.
  A questions file with no matching answers file produces items with no key.
- **`doc/` is git-ignored, and that is INTENTIONAL — never "fix" it.** Do not commit the
  generated `.md` pair, do not add a `!doc/questionnaire` negation or any other exception to
  `.gitignore`, and do not move authored content out of `doc/` to make it trackable. Newly
  generated files showing as ignored is the design working, not a problem to solve. The reason
  is stated in `.gitignore:52-55`: the build converts `questionnaire/` into
  `app/content/questions/en/**.json`, **which IS committed — one copy of the Q&A in the repo,
  not two.** The ignore is also deliberately the *whole* directory rather than a filename list,
  because enumerating it meant every new working doc was tracked by default and
  `doc/emailjs-setup.md` was committed that way on 2026-09-01 before being caught.
- **Because it is untracked, `doc/questionnaire/` is the ONLY copy of the authored content.**
  Git will not restore it, and **the compiled JSON is a lossy derivative** — items with no
  A–D options (STAAR griddables, free-response) are not carried into it, roughly 74 of them —
  so the build cannot be run backwards to recover a lost source. Remind the user to **back
  `doc/` up outside the repo** after every generation run, and say so in the step 7 summary.
  Treat a request to delete or overwrite anything under `doc/` as a deletion of the sole copy:
  confirm first, under the never-delete-without-confirmation rule.

### The five things that decide whether the build works

`/gen-quest` holds the detail; verify all five before building, because four of them fail
*silently*:

1. **Filename** matches the anchored regex in `parse.mjs` — if it does not, date and time
   parse as `null`, every item id collapses to the same shape, and **the second file
   overwrites the first**. The subtopic must **never** go in the filename.
2. **H1 or `**Grade:** N`** declares the grade, or items file under grade `x`.
3. **`## <Exact Subtopic Name>`** opens each section — this, not the filename, is what files
   a question into its bucket. The name must match the curated taxonomy exactly.
4. **`## Question N`** with exactly four `A.`–`D.` options, or the item is dropped or flagged
   `needsReview`.
5. **`**Correct answer/value:** X. …`** in the answer file, or the wrong option ships marked
   correct.

**One file per generation, with a unique `HH-MM`.** Two files sharing subject, grade, date and
minute collide on ids even when both names are valid.

### Then build — and note that this step mutates tracked files

```bash
npm run build:content      # rewrites app/content/questions/en/**.json + manifest.json
```

This is **implementation, not a gate.** The §2/§5 gates are deliberately non-mutating; this
command is not one of them. After it runs, `git status` legitimately shows modified JSON under
`app/content/` — that is the intended product of a content change, and the step 7 summary must
say how many files and items moved.

### Content-specific requirements the gates will enforce

| Requirement | Where it comes from | What failure looks like |
|---|---|---|
| **25 questions per subtopic, uniform** — a floor, not a target | Owner, 2026-09-03 | `every subtopic meets its grade's question minimum` fails |
| **No empty bucket at any grade** | All 145 are filled | `no subtopic is empty at any grade` fails |
| **≥75% distinct question shapes per bucket, and no single shape >25%** | `test_question_variety.test.js` | The guard fails the bucket |
| **No `needsReview` item, and every item carries an explanation** | Content quality | `check:content` findings |
| **Keys spread across all four option positions** | Grade 7 precedent (186/186/189/189) | Not gated, but check it |

**The variety guard exists because of a real failure — read CLAUDE.md §12b before authoring
in bulk.** Grade 7 maths shipped 250 items that were ~21 distinct forms: twenty copies of one
numeric template plus five of a second per section, so a child saw the same question five times
running. Grades 1–6 average 0.98 distinct stems per item; those ten buckets ran 0.08–0.24.
**Generate authored variety, never a template with the numbers cycled.**

**Never rename, merge or re-route a subtopic to close a gap.** The taxonomy is fixed. Author
the missing questions.

### Adding a grade is mostly content, but not only content

Verified touch points — grade 7's own addition is the worked precedent (CLAUDE.md §1, §5):

| What | Where | Note |
|---|---|---|
| Content volume | `doc/questionnaire/` | Grade ≥ 6 uses the **extended** taxonomy: 10 subtopics × 3 subjects = **30 buckets**, × the 25 floor = **750 items minimum** |
| Taxonomy | — | **No change needed** at grade ≥ 6. `subtopicsForGrade` already routes any grade ≥ 6 to the extended list — this is why grade 7 was a bounds-and-rules change, not a content-model one |
| Bounds | `app/js/flow.js:22` **and** `app/js/stats-calc.js:17` | `MAX_GRADE` is declared **twice**, independently — both modules are import-free. Change one and the other silently disagrees |
| Navigation | `app/index.html:39–45` | One hardcoded `<a href="pages/topics.html?grade=N">` per grade |
| Security rules | `dbmgr/firestore.rules:168` | `d.grade >= 1 && d.grade <= 7` — until this rises, **every answer at the new grade is rejected `permission-denied`** |
| Roll-up cap | `dbmgr/firestore.rules:207` (comment at :199) | Capped at **21 = grades × 3 topics**. It **must rise with the grade range**, or the top grade's statistics write is refused once a child has worked across every grade |
| Rules deploy | `firebase deploy --only firestore:rules` | **Owner-run.** Provide the step; do not run it. A grade addition is not live until this lands |
| Tests pinning the range | `test_data`, `test_landing`, `test_subtopic_map`, `test_question_variety`, `test_firestore_rules`, `test_electrical_design` | Update together |

**`/gen-quest` carries one stale claim — do not propagate it.** It warns that "the site's own
navigation currently offers grades 1-6 only". Grade 7 shipped on 2026-09-04 and the live range
is **1–7** (CLAUDE.md §1, `app/index.html:45`). Verify the current bound in the code rather
than trusting either skill's prose.

---

## 5. Re-prove GREEN

Re-run **the identical three gates from §2**, same commands, same parallel Haiku subagents,
same verification contract. The whole value is comparability — a different command set on
the two sides proves nothing.

Then add the regression-evidence assertion:

```bash
node --test --test-reporter=tap 2>/dev/null | grep -E "^ok |^not ok " \
  | sed -E 's/^(not )?ok [0-9]+ - //' | sort > /tmp/nn-post-tests.txt
comm -23 /tmp/nn-baseline-tests.txt /tmp/nn-post-tests.txt   # MUST be empty
wc -l < /tmp/nn-baseline-tests.txt /tmp/nn-post-tests.txt
```

`comm -23` lists tests that existed at baseline and are **gone now**. It must be empty.
This is the concrete evidence that existing features are intact: no test was deleted,
renamed away, or converted to `skip`/`todo` to make a change pass.

**Post-change requirements, all of them:**

- `fail == 0`, `pass == tests`
- post test count **≥** baseline count (a behavioural change should *add* tests)
- `skipped` and `todo` **not increased** over baseline
- `check:content` → `No findings.`
- `check:arithmetic` → `WRONG 0`, exit 0, and `statements checked` not materially below
  `reference/baseline.md`
- `comm -23` baseline-vs-post → **empty**
- `git status --porcelain` shows only files this change intended to touch

Any of these failing is RED. **Fix it or report it — never narrow a test, skip it, or
delete it to reach green.** If the right fix is genuinely out of scope, stop and say so
with the evidence; scaling the work down is the owner's call.

---

## 6. Sync the documents

Documentation drift is treated as part of the change, not follow-up work. CLAUDE.md §3
records why: a stale source is worse than none, because it is what someone reaches for
when rewriting the page. The terms document described a $15.10 PayPal subscription for a
year after payments were dropped.

| Document | When it must change | Notes |
|---|---|---|
| **`CLAUDE.md`** | Architecture, module map, data model, taxonomy, pipeline, test counts, scope decisions, live state | It is the **design record**, not a readme. Record the *reasoning and the alternatives rejected*, not just the change. Update the test count and the dated live-state line in §1. |
| **`README.md`** | Repo layout, scripts, how to run tests, dependency list | Keep it current with the static + Firebase architecture. |
| **`.gitignore`** | A new dev-time artefact, output directory, or secret-bearing file appears | **`doc/` is ignored intentionally — never add an exception for it**, not even for newly generated `doc/questionnaire/` pairs. `run_app.sh` holds real secrets. Neither is ever committed. A content run adds untracked files by design; that is not a `.gitignore` change. |
| **`requirements.txt`** | A Python dependency genuinely appears — which would be a change of architecture, not a dependency bump | Corrected 2026-10-30: it carries **no packages by design** and explains why. See below. |
| **`doc/changelog.md`** | **Every deviation from the plan or the prompt**, every run | Git-ignored but required by the working rules. Also update the affected prompt file and `doc/static-migration-plan.md`. |
| **`dbmgr/firestore.rules` header** | The data model changed | This header is the **authoritative** schema — it is a deployed artefact and cannot drift out of the repo. |

### `requirements.txt` — empty, and it stays empty

**It is a 0-byte file.** The project has no Python dependencies: no tracked `.py` file exists,
and the only Python used anywhere is the standard library for `python3 -m http.server` local
preview. `nnrpi/` is a git-ignored leftover virtualenv with 0 tracked files.

Until 2026-10-30 it pinned 50 lines of legacy Flask residue — `flask`, `flask-session`,
`flask-limiter`, `redis`, `pytest`, `openai`, `certbot` and PayPal integration notes — last
touched in `ad4bb1e` and wrong for over a year. The Flask app was deleted 2026-09-01, payments
were dropped, there is no server, sessions are Firebase Auth, rate limiting is Security Rules
plus the Spark quota, the `openai` pin belonged to runtime generation that moved to dev time,
`certbot` was the Raspberry Pi's TLS, and pytest ran the deleted Python suite.

**Owner decision, 2026-10-30: empty means empty.** A first pass replaced the pins with comments
explaining each dead entry; the owner removed them — *"I do not need unnecessary comments in
requirements.txt. If we do not have anything to mention, then just keep it empty."* Do not
reintroduce explanatory comments, a header, or a placeholder. The history lives in
`doc/changelog.md` and in this file; the artefact itself carries nothing.

Add a pin only if a Python dependency genuinely enters the project. That would be an
architecture change and an owner decision, not a routine edit.

---

## 7. Present the summary table

One table, baseline against post-change, with the document sync and the regression evidence
in the same view. Report faithfully: if something is skipped, partial, or still red, say so
plainly here rather than in a footnote.

```markdown
## fix-or-ferment — <one-line description of the change>

**Branch:** ninjanerd-static (confirmed with you at step 1) · **`main` untouched**

### Gates

| Gate | Baseline | Post-change | Verdict |
|---|---|---|---|
| `npm test` | 377 pass / 0 fail / 0 skipped / 0 todo | <N> pass / 0 fail / 0 skipped / 0 todo | GREEN (+<n> tests) |
| `npm run check:content` | No findings, 4,175 items | No findings, <N> items | GREEN |
| `npm run check:arithmetic` | WRONG 0, exit 0, <N> checked | WRONG 0, exit 0, <N> checked | GREEN |
| firestore rules (20) | skipped locally — emulator unusable | unchanged / touched → CI gates it | n/a |

### Evidence that existing features are intact

| Check | Result |
|---|---|
| Baseline tests still present (`comm -23`) | <empty / list> |
| Test count | 377 → <N>, monotonic |
| skipped / todo | 0 / 0 → 0 / 0, not increased |
| New test proven to fail against a broken implementation | <what was mutated, and that `git diff` confirmed the revert> |
| `git status` | only the <n> intended files |

### Files changed

| File | Change |
|---|---|
| … | … |

### Content (include ONLY when §4a ran)

| Item | Result |
|---|---|
| Authored via `/gen-quest` | <grade> <subject>, <STAAR\|MAP [phase]> — `<questions file>` + `<answers file>` |
| `npm run build:content` | <N> JSON files rewritten, corpus <before> → <after> items |
| Buckets affected | <subtopic>: <before> → <after> (floor 25) |
| Variety guard | <N>% distinct shapes, max shape <N>% (needs ≥75% / ≤25%) |
| `needsReview` / missing explanation | 0 / 0 |
| Key spread across A–D | <n>/<n>/<n>/<n> |
| **`doc/` backup** | **git-ignored — the authored `.md` pair is the only copy. Back it up outside the repo.** |

### Document sync

| Document | Status |
|---|---|
| CLAUDE.md | synced — <what section> / no change needed |
| README.md | synced / no change needed |
| .gitignore | no change needed |
| doc/changelog.md | deviation logged / none to log |
| dbmgr/firestore.rules header | n/a — schema unchanged |
| requirements.txt | no change needed — empty by owner decision (2026-10-30) |

### Not done / limits

<Anything out of scope, any semantics not machine-verifiable, any open question.>
```

Then — and only then — ask for the outward action:

> Work complete and GREEN. May I commit to `ninjanerd-static`? `main` is untouched and no
> PR was opened.

---

## Working rules — the authority for this skill

### Tracked, in the repo

**`CLAUDE.md` §14 "Working rules for editing" is the authority.** Read it at the start of
every run; it governs when it and this file disagree. It is linked, not copied, so it cannot
drift out of sync here. Supporting sections this skill leans on:

| Section | What it holds |
|---|---|
| [§14](../../../CLAUDE.md) | Branch discipline · outward-action approval · owner-run commands · mirror-don't-invent · never delete without confirmation · secrets · pause-and-show |
| §2, §3 | Architecture, the import-free-sibling rule, repository layout, why `doc/` is git-ignored |
| §5, §5b, §5c | The fixed taxonomy and the two Learn-only animation topics |
| §6, §12a, §12b | The content pipeline and the traps in `mathnorm`/`parse` |
| §7 | The data model and the security rules |
| §10 | Never root-absolute paths |
| §12 | Testing, the emulator, `--test-reporter=tap`, `npm ci` over `npm ls` |
| §15 | Reading the deleted legacy tree via `git show 104c466:<path>` |

### Memory-only — not in any tracked file

These were given by the owner across sessions and live only in auto-memory. **Committing
this skill makes them durable in the repo for the first time.** They bind this skill
exactly as §14 does.

- **No Claude attribution in commits or PR bodies.** No `Co-Authored-By`, no
  `Claude-Session`, no "Generated with Claude Code" footer. Plain subject plus a body
  explaining the change and its reasoning, written as the owner's own. *This overrides the
  harness default that appends those trailers.*
- **Stay inside the project directory.** For any path outside
  `/Users/praveenrai/Personal/Krishang/NinjaNerd`, ask permission first with a one-line
  reason. The auto-memory directory is the one standing exception.
- **The per-task gate is test-then-show.** A task is done when it is (1) verified by a
  passing unit/mock test and (2) shown to the owner with the highlighted file list and the
  *actual* output. Do not start the next task until they confirm.
- **Nothing is committed until fully verified.** Never commit work whose tests only skip.
- **Mirror-don't-invent covers DATA, not just pages.** Read the legacy implementation before
  designing any schema, storage shape or API. Apply the rule systematically to every page,
  not only the one just flagged.
- **The landing page is public and is the About page.** Browsing is public through
  grade → topics → subtopics → explore; the login gate sits at the Learn/Practice action and
  returns the student to the activity they chose, carrying `next`. Never redirect the root
  to login.
- **Retire, don't delete.** Historically by prepending `obs_` via `git mv` to preserve
  history. The legacy tree is gone, so the mechanism rarely applies, but the rule it serves —
  no file disappears without the owner's explicit confirmation — is in full force.
- **Temporary or stale files that you created are yours to delete.** Clean up after yourself.
- **Ask rather than guess.** Use `AskUserQuestion` for real decision forks, especially where
  a static-platform constraint forces a divergence from the legacy app.
- **After any push, proactively confirm `main` is unchanged** (`git log --oneline -1
  origin/main`) and that no PR was opened. Git's `Create a pull request for '<branch>'` line
  is a hint, not an action — never act on it, and explain it when it appears. Beware the
  GitHub API too: with Pages `build_type: "workflow"`, `source.branch` still reports `"main"`
  as a stale leftover; the authoritative record is
  `gh api repos/<owner>/<repo>/deployments`.

### The one rule behind all of them

**Nothing is invented.** Every constant, behaviour, layout and schema decision is either
sourced from the legacy app, recorded in `CLAUDE.md` as a deliberate decision, or asked
about. If you cannot point to where a choice came from, you have invented it — stop and ask.

---

## Reference

- `reference/baseline.md` — the frozen GREEN baseline: test counts, corpus size, and the
  `check:arithmetic` figures that step 2 and step 5 compare against. The 30-id allowlist it
  used to carry is gone; the tool classifies those statements itself as of 2026-10-30.

### Related skills

| Skill | Relationship |
|---|---|
| **`/gen-quest`** | **Invoked by this skill** (§4a) whenever the ask is to add questions, fill a thin or empty bucket, fix repetitive content, or add a grade. It owns the authoring contract — filename regex, section headings, option and answer-line shape, TEKS anchoring, medium-to-high difficulty. Never duplicate that contract here; a byte-exact parser contract cannot have two sources of truth. This skill owns everything around it: the branch, the gates, `build:content`, the variety and floor checks, doc sync and the evidence table. |
| `/code-review` | Reviews a diff for defects. Complementary — run it on the change this skill produced, not instead of step 5. |
| `/git-repo` | Branch checkout, push, commit listing. This skill's step 1 does its own branch check; outward actions still need approval at the moment they are reached. |
