# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is (current: static site)

NinjaNerd is being rebuilt as a **static site hosted on GitHub Pages** at the custom
domain **ninjanerd.ai**. Students land on an **About** page (public), and log in only when
they choose a grade to practice. Multiple-choice questions (grades **1–6**; **English,
Math, Science**) are authored `.md`/answer files converted **at dev time** into normalized
JSON that the browser loads, randomizes, and checks client-side. **No runtime LLM. No
payments.** Auth, per-user progress/stats, and collaboration/chat run on **Firebase**
(Auth + Firestore). Browser games are kept. Target languages: English → French → Hindi.

The migration is planned and executed prompt-by-prompt; see the git-ignored
`doc/static-migration-plan.md`, `doc/prompt/NN_*.md`, and `doc/changelog.md`.

## Paths inside `app/` — never root-absolute

The site is served from **two different mount points**: `https://prai-git.github.io/NinjaNerd/`
(pre-launch verification) and `https://ninjanerd.ai/` (live). A path beginning with `/`
resolves from the host root, so it works only on the second and 404s silently on the first.

Every served page therefore carries a **`<base>` tag** — `./` in `app/index.html`, `../` in
`app/pages/*.html`, placed right after `<meta charset>` and before any `<link>`/`<script>` —
and **every same-origin path is written without a leading slash** (`assets/css/site.css`,
`pages/topics.html`, `content/questions/...`, `static/games/...`). This covers JS too:
`fetch()`, `location.href`, and dynamically-created `src`/`href` all resolve against
`document.baseURI`, which `<base>` sets. `app/assets/js/layout.js` is why a `<base>` is needed
rather than plain relative paths — it injects one fixed nav/footer string into pages at two
different depths.

`test/test_base_path.test.js` enforces this and **will fail the build** on any reintroduced
`href="/`, `src="/`, or quoted `'/pages/...'`-style path under `app/` (`obs_*` excluded).
See `doc/prompt/00_base_path_prompt.md`.

## Repository layout

- **`app/`** — the **published site root** (served at `https://ninjanerd.ai/`, no `/app`
  URL prefix): `index.html` (About landing), `pages/`, `assets/{css,js,img}/`, `js/`,
  `content/questions/<lang>/<grade>/<subject>/<subtopic>.json`, `i18n/<lang>.json`,
  `CNAME`, `.nojekyll`.
- **`obs_static/`** — **retired.** Was the shared game/logo/css/js asset tree. The games
  subtree was copied to `app/static/games/` (only `app/` is published), and the served copy
  is now the only one maintained, so this reference duplicate was retired rather than kept
  in sync. Removed with the rest of the `obs_` tree.
- **`dbmgr/`** — the database layer. Holds the **current** Firestore config
  (`firestore.rules`, `firestore.indexes.json`) alongside the **retired** SQLite/Flask
  modules, which are prefixed per file (`obs_*.py`) since the folder name itself was
  reclaimed. `firebase.json` stays at the **repo root** (the Firebase CLI searches upward
  from the working directory, so it would never find it in a subfolder) and points at
  `dbmgr/firestore.rules`. **Never served.**
- **`tools/`** — dev-time Node scripts (content build, translations). **Never served, never
  run at runtime.**
- **`test/`** — JS `node:test` suites (`*.test.js`). **Not served.**
- **`.github/workflows/pages.yml`** — deploys `app/` to GitHub Pages (native branch-folder
  only allows `/` or `/docs`, so a custom `/app` folder is published via Actions).
- **`doc/`** — git-ignored working docs: planning (plan, prompts, changelog) **and**
  `doc/questionnaire/` (authored question/answer source for the content build).
  **Exception:** `doc/firebase-setup.md` **is committed** — it holds the Firestore data model
  and the owner's do-once console checklist, which the repo needs long-term. The
  build's committed output — `app/content/questions/en/**.json` — is the repo's single
  copy of the Q&A; the source stays local so the same questions aren't stored twice.
  Keep a backup of `doc/questionnaire/` outside the repo: it is the only place the
  authored `.md`/`.html` and the ~74 non-MCQ items (griddables, free-response) live.
- **`obs_*`** — the retired Flask backend, kept for reference (see below).

## Publishing / deploy

Push to branch `ninjanerd-static` → the Actions workflow uploads `app/` and deploys to
Pages. Only `app/` is reachable via the domain; `doc/`, `obs_*`, `tools/`, `test/` return
404. Custom-domain DNS + HTTPS are finalized in prompt 14.

## Tests

New tests are JavaScript, run with Node's built-in runner:

```bash
npm test          # == node --test  (runs test/*.test.js)
```

Firebase-dependent logic is tested against the **Firebase Local Emulator**; dev-time
OpenAI/EmailJS calls are **mocked** (no network in tests). Every prompt/task ships with a
unit/mock test as part of its done-criteria.

## The `obs_` convention (retired code — do not run, do not extend)

Nothing is deleted during the migration. Superseded files/folders are retired by
prepending **`obs_`** (via `git mv`, preserving history). Current `obs_` items: `obs_app.py`
and the packages `obs_ai/`, `obs_core/`, `obs_gw/`, `obs_logging_system/`,
`obs_session_storage/`, `obs_templates/`, the LLM prompt texts `data/obs_*.txt`, and the
legacy Python tests `test/obs_*.py`. These describe the **old Flask app** and are kept only
as a conversion reference. Do not import from, run, or build on them.

**`dbmgr/` is the exception**: the folder name was reclaimed for the *current* database layer
(Firestore rules + indexes), so the retirement happens **per file** instead — every legacy
Python file inside it carries the prefix (`dbmgr/obs_db_manager.py`, `dbmgr/obs___init__.py`,
…). Same rule applies: `obs_`-prefixed means retired, whatever the folder is called.

`data/privacy_policy.txt` and `data/terms_and_conditions.txt` are intentionally **not**
`obs_`-prefixed — they are the content source for the static privacy/terms pages (prompt 02).

## Legacy Flask backend (retired — reference only)

The `obs_*` tree is the former Flask monolith: `obs_app.py` (~3000-line app, ~49 routes)
wired the LLM pipeline (`obs_ai/llm_service.py`, `obs_core/safe_llm_facade.py`,
`obs_core/question_processor.py` option-shuffling), SQLite storage (`dbmgr/obs_*.py`), Redis/
filesystem sessions (`obs_session_storage/`), production logging (`obs_logging_system/`),
gateways (`obs_gw/`: Gmail SMTP, PayPal, Porkbun), and Jinja templates (`obs_templates/`).
Its behavior is authoritative history for how features worked, but it is **not** part of
the static site. `run_app.sh` stays git-ignored and holds real secrets — never commit or
copy it. For deep detail, consult git history.

## Notes for editing

- Keep secrets out of the public repo. Firebase web config is **public by design** (not a
  secret); security is enforced by Firebase Auth + Firestore Security Rules.
- Follow the working rules in `doc/` (git-ignored): pause-and-show after each prompt with
  highlighted changes + test output; log deviations in `doc/changelog.md` and update the
  affected prompt + plan; ask before commit/push; never delete existing files without
  confirmation (retire via `obs_`).
