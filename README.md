# NinjaNerd 🥷📚

An educational practice platform for **grades 1–6** (English, Math, Science), plus browser
games — delivered as a **static site on GitHub Pages** at **ninjanerd.ai**.

> **This project is being migrated from a Flask backend to a static site.** The former
> Flask app, its production docs (nginx/SSL/systemd), and the JSON/SQLite storage design
> are **superseded** and now live under `obs_`-prefixed paths (and in git history). This
> README describes the **static architecture**.

## Architecture

- **Static frontend** served by GitHub Pages from the **`app/`** folder (custom domain,
  HTTPS). Bootstrap + FontAwesome via CDN. Landing page is **About** (public); login is
  required only when a student enters practice for a grade.
- **Questions**: authored `.md`/answer files in `doc/questionnaire/` are converted **at dev
  time** (`tools/`, mockable OpenAI for free-response → MCQ) into normalized JSON under
  `app/content/questions/<lang>/<grade>/<subject>/<subtopic>.json`. The browser loads JSON,
  randomizes question + option order, and checks answers **client-side**. **No runtime LLM.**
  - **Two tiers**: **Learn = MAP** (grades 1–6); **Practice = STAAR** (grades 3–6) plus
    **Accelerated math / Honors ELAR** (grade 6).
- **Firebase** (client Web SDK): **Auth** (email/password, parent-created accounts),
  **Firestore** (per-user progress/stats/history; collaboration invites + realtime chat),
  secured by **Security Rules**. Config is public by design; there is no server secret.
- **Email**: Firebase Auth built-in emails (verification/reset) + **EmailJS** for the
  contact form. **No payments.**
- **i18n**: English → French → Hindi (dev-time translations, human-reviewed; never runtime).
- **Games**: JS/canvas games under `app/static/games/`, ported to static pages.
- **Paths**: every page carries a `<base>` tag and all same-origin paths are written
  **without a leading slash**, so the identical files serve correctly both from the
  GitHub Pages sub-path (`/NinjaNerd/`) and from the domain root. Enforced by
  `test/test_base_path.test.js`.

## Layout

```
app/                     # published site root (served at ninjanerd.ai/)
obs_static/              # retired: former shared asset tree (games live in app/static/)
tools/                   # dev-time build/translation scripts (not served)
test/                    # JS node:test suites (not served)
.github/workflows/       # GitHub Pages deploy of app/
doc/                     # planning (git-ignored) + questionnaire source (committed)
obs_*                    # retired Flask backend (reference only, not served)
```

## Develop & test

```bash
npm test        # node --test — runs test/*.test.js
```

Firebase logic is tested via the Firebase Local Emulator; OpenAI/EmailJS calls are mocked.

## Deploy

Push to branch `ninjanerd-static`; the Actions workflow (`.github/workflows/pages.yml`)
publishes `app/` to GitHub Pages. DNS (Porkbun) + HTTPS are configured in the deploy step.

## The `obs_` convention

Superseded files are retired by prepending `obs_` (never deleted), preserving git history.
See `CLAUDE.md` for details on the retired Flask backend.

---

**Author**: Praveen Rai
