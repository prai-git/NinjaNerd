# NinjaNerd 🥷📚

An educational practice platform for **grades 1–6** (English, Math, Science), plus browser
games — delivered as a **static site on GitHub Pages** at **ninjanerd.ai**.

> **Migration in progress: Flask backend → static site.** The former Flask app, its
> production docs (nginx/SSL/systemd) and the JSON/SQLite storage design are **superseded**
> and live under `obs_`-prefixed paths. This README describes the **static architecture**.

**Current state (2026-09-01)**

| | |
|---|---|
| Live (pre-launch) | **https://prai-git.github.io/NinjaNerd/** — a sub-path, not the root |
| Branch | `ninjanerd-static` (the only branch that deploys). `main` is frozen at the legacy Flask app |
| Firebase | Project `ninjanerd-32030` — Email/Password auth, Firestore (Standard, Production mode, `nam7`), **security rules deployed and verified** |
| Content | 1368 questions across grades 1–6 · **44 of 115 subtopics still have none** |
| Tests | `npm test` → 101 pass, 0 fail, 1 todo (the release gate below) |
| Not yet built | auth UI, progress persistence, collaboration, account/statistics/audit/contact pages, custom domain |

## Architecture

- **Static frontend** served by GitHub Pages from **`app/`**. Bootstrap + FontAwesome via CDN.
  Landing page is **About** (public); login is required only when a student starts **Learn or
  Practice** — browsing is open.
- **Questions**: authored `.md`/answer files in `doc/questionnaire/` are converted **at dev
  time** (`tools/`, optional OpenAI for free-response → MCQ) into normalized JSON under
  `app/content/questions/en/<grade>/<subject>/<legacy_subtopic_id>.json`. The browser loads
  the JSON, randomizes question **and** option order, and checks answers **client-side**.
  **No runtime LLM.**
- **Learn and Practice are two modes over the same items** — every grade has both. There are
  no content tiers.
- **Subtopics come from the legacy app**, not from the content: the fixed taxonomy in
  `obs_app.py SUBTOPICS`, ported by AST parse into `app/js/subtopics-data.js` with its
  original names, descriptions, icons and colours. Authored headings are *mapped* onto it.
  Subtopics with no questions render greyed out and unclickable.
- **Firebase** (client Web SDK): **Auth** (email/password) and **Firestore** (per-user
  progress/stats/history, collaboration invites, chat), secured by **Security Rules**. The
  document model mirrors the legacy SQLite schema column-for-column so Audit, Statistics and
  progress tracking behave as they did. Config is public by design; there is no server secret.
- **Email**: Firebase Auth built-in mail (verification/reset) + **EmailJS** for the contact
  form. **No payments.**
- **English only.** French/Hindi were dropped; the `en` path segment remains so a language
  could be added later without moving content. (`app/i18n/` exists but is an empty
  placeholder — no strings, no framework, nothing references it.)
- **Games**: JS/canvas games under `app/static/games/`, ported to static pages.
- **Paths are never root-absolute.** Every page carries a `<base>` tag and same-origin paths
  omit the leading slash, so the identical files work from the Pages sub-path (`/NinjaNerd/`)
  **and** the domain root. Enforced by `test/test_base_path.test.js`.

## Layout

```
app/                     # published site root — the ONLY folder served
dbmgr/                   # firestore.rules + indexes (current); obs_*.py (retired SQLite)
tools/                   # dev-time build scripts (not served)
test/                    # node:test suites (not served)
.github/workflows/       # pages.yml (deploy app/) · rules.yml (Firestore rules in CI)
firebase.json            # repo root — the CLI searches upward, so it cannot move
.firebaserc              # repo root — pins project ninjanerd-32030
doc/                     # ENTIRELY git-ignored: plan, prompts, changelog, questionnaire
obs_*                    # retired Flask backend + obs_static/ (reference only, not served)
```

> `doc/` is not in version control, so the plan, prompts and the authored question source
> exist only on the author's machine. **Back it up separately.**

## Develop & test

```bash
npm ci          # use ci, not install — it catches peer conflicts that break CI
npm test        # node --test — runs test/*.test.js
npm run build:content   # rebuild question JSON from doc/questionnaire/
```

**Firestore rules are tested against the emulator in CI only** (`.github/workflows/rules.yml`,
13 cases). Those tests skip locally so `npm test` stays green without Java. OpenAI/EmailJS
calls are mocked; no test touches the network.

## Deploy

Push to `ninjanerd-static`; `.github/workflows/pages.yml` publishes `app/`. Only that branch
is permitted to deploy. Custom domain (Porkbun DNS + HTTPS) is the final step before launch.

**Release gate:** the site must not launch with an empty subtopic. A student choosing a
subject and meeting a wall of dead cards is a broken product. Tracked by the `todo` test
*"no subtopic is empty at any grade"*.

## The `obs_` convention

Superseded files are retired by prepending `obs_` (via `git mv`, preserving history) rather
than deleted. `obs_`-prefixed means **retired — do not run, do not extend**. See `CLAUDE.md`.

---

**Author**: Praveen Rai
