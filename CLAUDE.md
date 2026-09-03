# CLAUDE.md — NinjaNerd design document

Guidance for Claude Code (claude.ai/code) working in this repository, and the **detailed
design record** for the implementation as it actually stands.

---

## 1. What this is

NinjaNerd is an educational practice platform for **grades 1–7** in **English, Math and
Science**, plus browser games, delivered as a **static site on GitHub Pages** at
**ninjanerd.ai**.

It was rebuilt from a Flask monolith. The defining constraint of that rebuild: **there is no
server.** Everything the old backend did at runtime either moved to build time, moved into the
browser, or moved to Firebase.

| Old (Flask) | Now (static) |
|---|---|
| LLM generates questions per request | Questions authored offline, compiled to JSON at dev time |
| SQLite + JSON store | Firestore, one document tree per user |
| Flask sessions (Redis/filesystem) | Firebase Auth + a `localStorage` activity stamp |
| Server-side option shuffling | `app/js/quiz.js`, in the browser |
| Gmail SMTP gateway | EmailJS (contact) + Firebase Auth mail (verification/reset) |
| PayPal gateway | **Dropped** — no payments |
| Flask-Limiter rate limits | Firestore Security Rules + the Spark plan's hard quota |
| Jinja templates | Static HTML + a shared shell injected by `layout.js` |

**Scope decisions, all deliberate:** English only (French/Hindi dropped 2026-08-29; the `en`
path segment stays so a language could be added without moving content) · no payments ·
no runtime LLM · **no collaboration/chat** (dropped 2026-09-01 — child-to-child messaging
carries the heaviest COPPA obligation and nothing depended on it; the Firestore rules for
`invites`/`chat_sessions`/`messages` were *deleted* rather than left dormant, so those
collections are default-deny).

**Live state (2026-09-02):** repo public · branch `ninjanerd-static` deploys to
**`https://ninjanerd.ai/`** (custom domain live since 2026-09-01; the Let's Encrypt
certificate covers the apex and `www`, which redirects to the apex) · Firebase project
**`ninjanerd-32030`** with Email/Password auth and Firestore (Standard edition, Production
mode, `nam7`) · **grades 1–7** · 3,110 questions across all 145 subtopics ·
`npm test` → **297 pass, 0 fail, 1 todo** (the todo is the per-subtopic question floor,
which doubles as the authoring worklist).

Rules **deployed and verified** — grade 7's `d.grade <= 7` and the 21-key roll-up cap went
live on 2026-09-02. A grade addition always needs this deploy: until it lands, every answer at
the new grade is rejected `permission-denied` and the roll-up refuses the extra keys.

---

## 2. Architecture

```
                    Browser (the only runtime)
  ┌──────────────────────────────────────────────────────────┐
  │  static HTML + ES modules      ←── GitHub Pages (app/)    │
  │       │                                                   │
  │       ├── question JSON  ──── fetched, shuffled, marked    │
  │       │                       client-side                  │
  │       ├── Firebase Auth  ──── email/password, verification │
  │       ├── Firestore      ──── profile · history · stats    │
  │       └── EmailJS        ──── contact form                 │
  └──────────────────────────────────────────────────────────┘

  Dev-time only (never served, never run at runtime):
    doc/questionnaire/*.md  ──[ tools/build-content.mjs ]──▶  app/content/**.json
```

**Runtime dependencies** are all CDN-pinned; there are no runtime npm packages:
Firebase Web SDK 12.18.0 (gstatic) · Bootstrap 5.3.3 · Font Awesome 6.5.2 · KaTeX 0.16.22 ·
EmailJS 4.4.1.

Firebase modules are imported directly from `https://www.gstatic.com/firebasejs/12.18.0/…`.
**Node cannot `import()` an https:// URL**, so any logic that needs real unit tests is
extracted into an **import-free sibling module** — that is why `stats-calc.js`, `idle-core.js`,
`quiz.js` and `content-loader.js` exist separately from the files that wire them up. Modules
that import the SDK can only be checked as text.

---

## 3. Repository layout

- **`app/`** — the **published site root**, served at `https://ninjanerd.ai/` with no `/app`
  URL prefix.
  - `index.html` — the public About landing page
  - `pages/` — login, signup, topics, subtopics, explore, learn, practice, statistics,
    account, audit, contact_us, games, game, privacy, terms
  - `js/` — per-page ES modules (see §4)
  - `assets/{css,js,img}/` — site CSS, the three classic scripts, logo
  - `content/questions/en/<grade>/<subject>/<subtopic_id>.json` + `manifest.json`
  - `static/games/` — `geodash`, `mmh`, `tank_attack`, `tejas_thrust`
  - `favicon.ico`, `.nojekyll`
  - **`CNAME`** — ships here since the domain went live (2026-09-01). It was staged at the
    repo root as `CNAME.pending` for the whole migration, because Pages reads `app/CNAME` on
    deploy and redirects the `.github.io` URL to the custom domain; doing that before DNS
    resolved would have broken pre-launch verification. `test_smoke.test.js` enforces that
    exactly **one** of the two exists, so a reappearing `CNAME.pending` fails the build.
- **`dbmgr/`** — `firestore.rules` + `firestore.indexes.json`. **Never served.** `firebase.json`
  and `.firebaserc` stay at the **repo root** (the CLI searches upward, so it would never find
  them in a subfolder).
- **`tools/`** — dev-time Node scripts: `build-content.mjs`, `check-content.mjs`, and
  `lib/{parse,mcq,llm,mathnorm,subtopic-map}.mjs`. **Never served, never run at runtime.**
- **`test/`** — `node:test` suites (`*.test.js`) plus `fixtures/`. **Not served.**
- **`.github/workflows/`** — `pages.yml` (deploy) and `rules.yml` (emulator rules tests).
- **`data/`** — `privacy_policy.txt`, `terms_and_conditions.txt`: the content source for the
  static legal pages. **`test_legal.test.js` now checks the sources against the pages** — grade
  range, "no payments", and a shared `Last updated` date. Before that nothing did, and the terms
  source still described a $15.10 monthly PayPal subscription a year after payments were
  dropped. A stale source is worse than none: it is what someone reaches for when rewriting the
  page.
- **`doc/`** — **entirely git-ignored; nothing under it is tracked.** The plan, the `NN_*`
  prompts, `changelog.md`, `firebase-setup.md`, and `doc/questionnaire/` (the authored
  question source). These are working documents, not reference material — **anything the repo
  needs long-term must live in a tracked file instead.** The Firestore schema, for example, is
  documented in the header of `dbmgr/firestore.rules`, which is committed because it is a
  deployed artifact. **Back `doc/` up outside the repo:** it is the only place the authored
  `.md`/`.html` and the ~74 non-MCQ items (griddables, free-response) exist.

---

## 4. Page flow and module map

```
index.html (public)  ── grade ─▶  topics.html?grade=N
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
      subtopics.html?grade&subject            games.html?grade
                     │                               │
                     ▼                               ▼
      explore.html?grade&subject&subtopic      game.html?slug
                     │
        ┌────────────┴────────────┐   ◀── LOGIN GATE (requireLogin)
        ▼                         ▼
   learn.html               practice.html
```

**Browsing is public; the gate is at the activity.** `explore.js` calls `flow.requireLogin()`,
which redirects to `login.html?next=<target>` so the student returns to the activity they
chose. This is deliberate — an IXL-style "look before you sign up" flow.

| Module | Role |
|---|---|
| `flow.js` | The shared spine: `SUBJECTS`, URL `param()`, `requireLogin()`, `renderInline()`, `renderBlocks()`, `emitAttempt()` |
| `content-loader.js` | Pure, injectable-fetch JSON loading (testable without a network) |
| `quiz.js` | Pure shuffling of question order **and** option order, preserving the correct-answer mapping |
| `practice.js` / `learn.js` | The two modes over the same items |
| `data.js` | All Firestore writes (see §7) |
| `stats-calc.js` | Pure statistics computation, extracted for unit testing |
| `auth.js` | Signup, login, logout, reset, verification |
| `idle-core.js` / `idle-timeout.js` | Policy / wiring split for the idle timeout (§8) |
| `subtopics-data.js` | The taxonomy (§5) |
| `games-data.js` | Game slugs, names, icons, colours |
| `assets/js/layout.js` | Injects one nav + footer string into every page — **a classic script** |
| `assets/js/auth-state.js` | Display-only cache so the nav paints before Firebase resolves |
| `assets/js/toast.js` | Replaces Flask flash messages |

---

## 5. The subtopic taxonomy

The subtopic list students see is a **fixed curated taxonomy inherited from the legacy app's
`SUBTOPICS` table**, never derived from the authored content. It lives in
`app/js/subtopics-data.js`, **generated by AST parse rather than retyped**, so names,
descriptions, Font Awesome icons and Bootstrap colours cannot drift. Grade routing mirrors the
legacy route: **grade ≤ 5** gets the base list of 5 per subject, **grade ≥ 6** the extended
list of 10. Grade 7 therefore needed no taxonomy change at all — `subtopicsForGrade` already
routed it, which is why adding the grade was a bounds-and-rules change, not a content model one.

Authored questions are **mapped** onto it by `tools/lib/subtopic-map.mjs`. Each compiled item
keeps `sourceSubtopic` — the heading it was authored under — so a remap is a table edit, not a
content rebuild.

> **Never rename, merge or re-route a subtopic to close a gap.** Author the missing questions
> instead. Subtopics with no questions render greyed out and unclickable; **all 115 are now
> filled**, and the test *"no subtopic is empty at any grade"* makes a regression a build
> failure.

Grades 1–5 math carries two owner-approved additions beyond the legacy set
(`algebraic_concepts`, `financial_literacy`) — a deliberate, recorded divergence.

---

## 6. Content pipeline (dev time only)

`doc/questionnaire/*.md` (question file + answer file pairs) → `npm run build:content` →
`app/content/questions/en/**.json`.

Stages, in `tools/`:
1. **`parse.mjs`** (875 lines — the heaviest) splits headings, pairs questions with answers,
   and strips authoring artefacts: document footers, and **standards annotations**
   (TEKS/STAAR/MAP/NWEA lines) that must never reach a child. It also decides **which reading
   text each question is served** (see below) — the subtlest thing it does.
2. **`mcq.mjs`** detects multiple-choice items and converts what it can; `splitMultiPart`
   separates compound questions.
3. **`llm.mjs`** — *optional* OpenAI adapter that generates distractors for free-response
   items. **Dev time only, mocked in tests, never shipped.** Without `OPENAI_API_KEY` those
   items are flagged `needsReview` rather than converted.
4. **`mathnorm.mjs`** normalises maths delimiters — and distinguishes maths from currency,
   which is why `$12.50` does not become a KaTeX block.
5. **`subtopic-map.mjs`** maps the authored heading onto a legacy subtopic id.

**Compiled item shape** (each file is a plain JSON **array**):

```json
{ "id": "math_g5_2026-03-26_10-15_q7", "grade": 5, "subject": "math",
  "sourceSubtopic": "Income and Expense Word Problems", "subtopic": "financial_literacy",
  "passage": null, "passageTitle": null,
  "question": "…", "options": ["…"], "correctIndex": 3,
  "explanation": "…", "source": "authored", "needsReview": false }
```

`manifest.json` holds `{ generatedAt, grades: { "<grade>": { "<subject>": [{subtopic, slug,
count}] } } }` — the browser reads it to know what exists without fetching every file.

`tools/check-content.mjs` audits the compiled corpus (currently 3,110 items, no findings).

**Paired passages (2026-09-02).** An item has ONE `passage` field, but a STAAR paired set puts
two texts in front of the child. Passages are indexed by label (`passageKey`) and a question is
served every text it names — in its **options** as well as its stem, because grade 1 asks
*"Which source would best answer…?"* with the labels only in the choices. A question naming one
half of a **letter-suffixed pair** (`Passage A`/`Passage B`, `6A`/`6B`) gets both, joined under
their own headings; a question naming nothing is left on positional scoping.

Two faults had combined to ship **19 unanswerable questions** across grades 1, 3, 4, 5 and 6:
`passageKey` required a leading digit, so `Passage A` and every `Source A/B` was never indexed
and those sets fell back to positional scoping, which keeps only the LAST passage seen. Grade 3
asked *"Which sentence best paraphrases Passage A?"* while showing Passage B, with all four
options quoting text the child could not see.

**Only a letter-suffixed family counts as a pair.** Grade 4 declares Passages 1–5, 6A and 6B
back-to-back before any question, so "consecutive" cannot mean "paired" — merging all seven
would be worse than the bug. `check-content.mjs` now reports `unshown-source` when a question
names a label its passage does not carry, and `test_parse.test.js` enforces the same rule on
shipped content.

**Known gap, flagged not scheduled:** 200 items (6.4%) have no `explanation`, from sets whose
answers arrived only as a summary key table. Both views guard on the field, so no empty card
renders.

---

## 7. Data model and security rules

The document model mirrors the legacy SQLite schema column-for-column, so Audit, Statistics
and progress tracking behave as they did. **The authoritative copy of this schema is the
header of `dbmgr/firestore.rules`** — it is a deployed artifact and cannot drift out of the
repo.

```
users/{uid}                      email · school_name · is_admin · created_at · updated_at
users/{uid}/history/{autoId}     question · user_answer · correct · topic · subtopic ·
                                 grade · timestamp
users/{uid}/statistics/summary   last_login · questions_attempted · topics_covered[] ·
                                 attempts_by{} · correct_by{} · updated_at
```

**Rules design:**
- `isOwner(uid)` for everything; `isAdmin()` (reading `is_admin` off the requester's own
  profile) additionally grants **cross-user read**, which exists solely for the Audit page.
- `is_admin` is **immutable from the client** — granted by hand in the console. There is
  deliberately no in-app path.
- History is **append-only**: `allow update, delete: if false`.
- `timestamp == request.time` — the server pins it; a client cannot backdate.
- Everything else is default-deny via `match /{document=**} { allow read, write: if false; }`.
- Validation is shape-exact (`hasOnly` + `hasAll`) with size caps: email ≤ 254, school_name
  ≤ 200, question ≤ 4000, user_answer ≤ 1000, subtopic ≤ 100, roll-up maps ≤ 21 keys
  (7 grades × 3 topics — **this cap must rise with the grade range**, or the top grade's
  statistics write is refused once a child has worked across every grade).

**A `list` query needs `list` permission, not `get`** — `isOwner(uid)` cannot satisfy a
collection query because the wildcard is unbound. This is why the Audit lookup by email works
only for admins.

**The statistics roll-up is a cost decision.** `attempts_by`/`correct_by` are maps keyed
`g<1-7>_<topic>`, incremented with `increment()` nested inside `set(…, {merge:true})` in the
**same batch** as the history write. Before this, rendering Statistics read up to 1,000 history
documents; now it reads **one**. `notTooFast()` enforces a one-second floor between summary
updates.

**Write resilience:** `data.js` `commitWithOneRetry()` retries a failed batch **exactly once**,
after 1200 ms plus jitter, on `permission-denied` / `unavailable` / `deadline-exceeded` /
`aborted`. One retry with jitter — not a loop — so a Firestore blip doesn't lose a child's
answer and a thundering herd cannot form.

---

## 8. Sessions and idle timeout

Firebase Auth persists sessions indefinitely, so the timeout is ours. **30 minutes, rolling**
— sourced from the legacy app, not chosen (legacy set `SESSION_TIMEOUT_MINUTES = 30` with
`session.permanent = True`, which Flask refreshes per request).

- `idle-core.js` is the **pure policy**, import-free and genuinely unit-tested:
  `IDLE_LIMIT_MS` = 30 min, `WARN_BEFORE_MS` = 2 min **carved out of** the 30 (not added, or
  the real timeout would silently become 32), `evaluate()`, `formatCountdown()`.
- `idle-timeout.js` is the **wiring**: activity listeners, the countdown modal, sign-out, and
  cross-tab coordination through `localStorage` (`nn_last_activity`, `nn_idle_logout`),
  flushed at most every 15 s.
- A restored session that is *already* stale expires immediately on `setSignedIn()`.

---

## 9. Rendering

`flow.js` renders authored content in two layers:
- **`renderInline()`** — inline markdown within a line.
- **`renderBlocks()`** — fenced code → `<pre>`; **pipe tables → Bootstrap
  `table-responsive`** (a delimiter row is required, and alignment maps to Bootstrap 5's
  `text-start`/`text-end`/`text-center`); everything else falls through to inline.

Two traps worth remembering: Bootstrap 5 dropped `text-left`/`text-right` and **fails
silently** if you use them; and a question is rendered in `<div class="h5">`, never `<h5>`,
because a heading element cannot legally contain a `<table>`.

`math-render.js` applies KaTeX after content is in the DOM.

---

## 10. Paths inside `app/` — never root-absolute

The site is served from **two mount points**: `https://ninjanerd.ai/` (live, at the root) and
`https://prai-git.github.io/NinjaNerd/` (a SUB-PATH, which now 301-redirects to the domain).
A path beginning with `/` resolves from the host root, so it works only on the first and 404s
silently on the second. **The rule stays enforced** — the sub-path is still how the site is
verified before a domain change, and a root-absolute path would break it again.

Therefore every served page carries a **`<base>` tag** — `./` in `app/index.html`, `../` in
`app/pages/*.html`, placed right after `<meta charset>` and **before any `<link>`/`<script>`**
— and **every same-origin path omits the leading slash**. This includes JS: `fetch()`,
`location.href` and dynamically-created `src`/`href` all resolve against `document.baseURI`.

`app/assets/js/layout.js` is *why* a `<base>` is needed rather than plain relative paths: it
injects one fixed nav/footer string into pages at two different depths.

`test/test_base_path.test.js` **fails the build** on any reintroduced `href="/`, `src="/`, or
quoted `'/pages/...'`-style path under `app/`.

---

## 11. Abuse and cost controls

App Check is **off by owner decision (2026-09-01)**, not by oversight: reCAPTCHA v3 was
deprecated in App Check, and its replacement requires a Google Cloud **billing account** even
for the free tier. Attaching one would move the project off the **Spark plan, whose free quota
is a HARD cap** — Firestore stops serving rather than billing. That ceiling was judged worth
more than App Check for launch. `firebase-init.js` keeps the scaffolding, disabled, and logs
why.

What carries the load instead: the Security Rules (shape validation, size caps, server-pinned
timestamps, the one-second write floor), the roll-up that cut read amplification, and the plan
quota itself. **Revisit if the project ever moves to Blaze** — at that point the hard cap is
gone and App Check becomes the missing control.

The contact form adds a honeypot, and **the EmailJS recipient is pinned in the template, never
sent from the browser** — the public key is public by design, so a client-supplied recipient
would be an open relay on the owner's Gmail.

---

## 12. Testing

```bash
npm test          # node --test — runs test/*.test.js
```

**297 pass, 0 fail, 1 todo** across 22 test files. Every prompt/task ships with a unit or mock test
as part of its done-criteria. **No test touches the network** — OpenAI and EmailJS are mocked.

**Firestore rules are tested against the emulator in CI only** (`.github/workflows/rules.yml`,
13 cases). **The emulator does not work on the owner's Mac** — REST hangs, gRPC resets; two
emulator jars, two JDKs, the sandbox, `demo-` ids and proxy config were all ruled out. Do not
retry it locally.

Those tests **skip** locally so `npm test` stays green without Java — right for a laptop,
dangerous in CI, where a non-starting emulator would skip all 13 and report success. Two guards
prevent that: `NN_REQUIRE_EMULATOR=1` turns a skip into a non-zero exit, and the workflow parses
the TAP counts. Use `--test-reporter=tap` when parsing — the default reporter prints
`ℹ pass N`, not `# pass N`.

Verify dependency changes with a clean **`npm ci`**, not `npm ls` — `npm ls` reads an
already-populated `node_modules` and misses peer conflicts that break CI.

---

## 13. Deploy

Push to `ninjanerd-static` → `pages.yml` uploads `app/` and deploys to Pages. (The native
branch-folder setting only allows `/` or `/docs`, so a custom `app/` folder needs Actions.)
Only `app/` is reachable; `doc/`, `tools/`, `test/`, `dbmgr/` return 404.

Rules deploy separately: `firebase deploy --only firestore:rules`.

**Live at `https://ninjanerd.ai/`** since 2026-09-01. The `github-pages` environment permits
**only** `ninjanerd-static` to deploy. DNS is at Porkbun: four `A` records on the apex pointing
at GitHub's Pages addresses, and `www` as a `CNAME` to `prai-git.github.io`. The domain is
attached to this *project* repo, and `https://prai-git.github.io/NinjaNerd/` now 301-redirects
to it.

---

## 14. Working rules for editing

- **Branch discipline — `ninjanerd-static` only. Two hard rules, no exceptions:**
  1. **No change of any kind is made outside the current branch.** Every commit and every file
     edit belongs to `ninjanerd-static`. Do not create branches, check out or commit to another
     branch, cherry-pick, or push anywhere else.
  2. **Nothing is ever merged to `main`.** No merge, rebase, fast-forward, pull request, or
     direct push. `main` holds the legacy Flask app and stays frozen until the owner personally
     decides otherwise.
  - Git prints `Create a pull request for '<branch>'` after pushing a new branch. That is a
    hint, not an action — never act on it. After any push, state which branch was pushed and
    confirm `main` is untouched.
- **Every outward action needs its own explicit approval, asked for immediately before it**:
  commits, pushes, deploys, and GitHub settings changes (environments, branch policies,
  visibility, Pages config). An approval given earlier, or a step written into an approved
  prompt, is **not** consent to perform it now — "execute the prompt" authorises the code work,
  not the publishing at the end of it.
- **Commands that touch the owner's accounts — `firebase deploy`, GitHub settings — are for
  the owner to run.** Provide the steps, one at a time; do not run them.
- **Mirror the legacy behaviour; do not invent.** Where a static site forces a divergence,
  flag it explicitly in a comment rather than quietly choosing something.
- **Never delete files without confirmation.**
- Keep secrets out of the public repo. Firebase web config and the EmailJS public IDs are
  **public by design**; security is enforced by Auth + Security Rules. `run_app.sh` is
  git-ignored and holds real secrets — never commit or copy it.
- Pause-and-show after each task with highlighted changes + test output; log deviations in
  `doc/changelog.md` and update the affected prompt + plan.

---

## 15. The legacy Flask app (deleted 2026-09-01)

During the migration nothing was deleted; superseded files were retired by prepending `obs_`
via `git mv`. **That tree is now gone** — all 164 files removed once nothing referenced them:
the ~3,000-line `obs_app.py` (~49 routes), the packages `obs_ai/`, `obs_core/`, `obs_gw/`,
`obs_logging_system/`, `obs_session_storage/`, `obs_templates/`, `obs_static/`, the SQLite
layer under `dbmgr/`, the LLM prompt texts, 57 Python tests, and `app/pages/obs_dashboard.html`
(the only one ever served).

**To read any of it: `git show 104c466:<path>`** — the last commit that contained the tree.
List it with `git ls-tree -r 104c466`.

**Its behaviour remains authoritative history**, which is why ~40 comments across `app/js/` and
`test/` cite it by file and line. Those citations are the evidence that a constant or a
behaviour was *sourced rather than invented* — the core working rule of this migration.
**Do not strip them because the files are gone; that is when they start earning their keep.**

Where a test used to *read* a legacy file to prove a match, the relevant lines are now **quoted
verbatim in the test itself** with the `git show` reference beside them —
`test_contact.test.js`, `test_idle_timeout.test.js`, `test_account_audit.test.js`. The legacy
source is frozen and cannot drift, so the only half of those assertions that could still fail —
our code drifting away from it — is still checked.
