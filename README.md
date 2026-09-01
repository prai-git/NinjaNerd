# NinjaNerd 🥷📚

An educational practice platform for **grades 1–6** — English, Math and Science — plus browser
games. Students browse freely and sign in only when they start practising.

Delivered as a **static site on GitHub Pages** at **[ninjanerd.ai](https://ninjanerd.ai)**.

## Overview

- **1,622 questions** across 3 subjects × 6 grades, covering all 115 subtopics.
- **Learn and Practice** are two modes over the same material; every grade has both.
- Questions are authored offline and compiled to JSON at **dev time**. The browser loads the
  JSON, shuffles question and option order, and marks answers **client-side** — there is no
  runtime LLM and no server.
- **Firebase** provides the only backend: Auth (email/password) for sign-in, and Firestore for
  each student's progress, statistics and history. Access is governed by Firestore Security
  Rules; the web config is public by design and grants nothing on its own.
- **EmailJS** sends the contact form. There are no payments.
- Four canvas games ship alongside the practice content.

## Folder structure

```
app/                  # the published site — the ONLY folder served
├── index.html        #   landing page (public)
├── pages/            #   login, topics, subtopics, learn, practice, statistics, …
├── js/               #   page logic (ES modules)
├── assets/           #   css, img, shared js
├── content/          #   compiled question JSON + manifest
└── static/games/     #   geodash · mmh · tank_attack · tejas_thrust

dbmgr/                # Firestore security rules + indexes
tools/                # dev-time content build scripts
test/                 # node:test suites
.github/workflows/    # pages.yml (deploy) · rules.yml (rules tests in CI)
firebase.json         # must stay at the repo root — the CLI searches upward
```

Every page carries a `<base>` tag and writes same-origin paths **without a leading slash**, so
the same files work from a GitHub Pages sub-path and from the domain root alike.

## Getting started

Requires **Node.js 18+** (uses the built-in test runner).

```bash
npm ci                   # install (use ci, not install — it catches peer conflicts)
npm test                 # run the test suite
npm run build:content    # recompile question JSON from the authored source
```

To preview the site locally:

```bash
cd app && python3 -m http.server 8000    # then open http://localhost:8000
```

### Testing

`npm test` runs every suite under `test/`. No test touches the network — OpenAI and EmailJS
calls are mocked.

Firestore rules are verified against the Firebase emulator, which runs **in CI only**
(`.github/workflows/rules.yml`). Those cases skip locally so `npm test` stays green without a
Java install:

```bash
npm run emulator      # start the auth + firestore emulators
npm run test:rules    # run the rules tests against them
```

## Dependencies

No runtime npm dependencies — the browser loads everything from a CDN, pinned by version:

| | |
|---|---|
| Firebase Web SDK 12.18.0 | Auth + Firestore |
| Bootstrap 5.3.3 | layout and components |
| Font Awesome 6.5.2 | icons |
| KaTeX 0.16.22 | maths rendering |
| EmailJS 4.4.1 | contact form |

Dev-only (`devDependencies`): `firebase`, `firebase-tools`, `@firebase/rules-unit-testing`.

## Deploying

Pushing to the `ninjanerd-static` branch triggers `.github/workflows/pages.yml`, which
publishes `app/`. It is the only branch permitted to deploy.

## Author

**Praveen Rai**

## License

Released under the **MIT License** — see [LICENSE](LICENSE).
