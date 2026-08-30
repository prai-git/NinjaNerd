# Firebase setup (do once, owner in the loop)

Owner account: **ninjanerdonpi@gmail.com**, free **Spark** plan.

> **The Firebase web config is PUBLIC, not a secret.** It ships to every browser that loads
> the site and only identifies the project. What actually protects student data is Firebase
> Auth plus the rules in [`dbmgr/firestore.rules`](../dbmgr/firestore.rules). Never put a service-account
> key, admin credential, or private key anywhere under `app/`.

---

## 1. Console checklist

### 1.1 Create the project and register a Web app
1. Go to <https://console.firebase.google.com/> and sign in as the owner account.
2. **Add project** → name it (e.g. `ninjanerd`) → you may disable Google Analytics (not used).
3. In the project, click the **Web** icon (`</>`) to **register a Web app** (nickname
   e.g. `ninjanerd-web`). Do **not** enable Firebase Hosting: the site is on GitHub Pages.
4. Copy the `firebaseConfig` object shown on the SDK setup screen.
5. Paste those values into [`app/js/firebase-config.js`](../app/js/firebase-config.js),
   replacing every `TODO_REPLACE_ME`.

You can return to these values any time via
**Project settings → General → Your apps → Web app → SDK setup and configuration**.

### 1.2 Enable Email/Password authentication
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → **Enable** → **Save**.
3. Leave "Email link (passwordless sign-in)" **off**. No Google sign-in in v1.

### 1.3 Create Cloud Firestore
1. **Build → Firestore Database → Create database**.
2. Choose **Production mode** (starts locked down; our rules open exactly what is needed).
3. Pick a location close to your users (e.g. `nam5` / `us-central`). **This cannot be changed
   later.**

### 1.4 Authorized domains
**Authentication → Settings → Authorized domains → Add domain** for each of:

| Domain | Why |
|---|---|
| `localhost` | usually present by default; local development |
| `ninjanerd.ai` | the production custom domain |
| `prai-git.github.io` | the Pages URL used for pre-launch verification |

Sign-in is rejected from any origin not on this list, so a missing entry looks like a broken
login rather than a config problem.

### 1.5 Local tooling (for emulator-backed rules tests)
```bash
npm install                 # installs the dev dependencies
npm run emulator            # starts Auth + Firestore emulators
npm run test:rules          # runs the rules tests against them
```
The Firestore emulator is a **Java** program, so a JRE must be installed:
```bash
brew install --cask temurin     # macOS
java -version                   # verify
```

Rules are **not** deployed from here. Publishing them to production is part of prompt 14.

---

## 2. Firestore data model

```
users/{uid}
  displayName : string
  role        : "parent" | "child"      # set at creation, immutable afterwards
  createdAt   : timestamp

users/{uid}/attempts/{autoId}           # one answered question
  questionId  : string                  # e.g. "math_g4_2026-08-29_23-09_q26"
  correct     : boolean
  grade       : number                  # 1-6
  subject     : string                  # "english" | "math" | "science"
  subtopic    : string
  ts          : timestamp

users/{uid}/stats/{grade_subject}       # doc id e.g. "4_math"
  attempted   : number
  correct     : number
  updatedAt   : timestamp

users/{uid}/history/{autoId}            # one completed practice run
  grade, subject, subtopic : as above
  score       : number
  total       : number
  ts          : timestamp

collaboration/{roomId}
  participants : string[]               # uids; membership IS the access control
  createdBy    : string                 # uid, immutable
  createdAt    : timestamp

collaboration/{roomId}/messages/{autoId}
  senderUid   : string                  # must equal request.auth.uid on write
  text        : string
  ts          : timestamp
```

### Access summary (enforced by `dbmgr/firestore.rules`)
- `users/{uid}` and **all** its subcollections: read/write only when `request.auth.uid == uid`.
- `collaboration/{roomId}`: readable/updatable only by uids listed in `participants`; the
  creator must include themselves; `createdBy` cannot be reassigned; only the creator deletes.
- `collaboration/{roomId}/messages`: readable and creatable only by room participants, and you
  may only post as yourself. **Messages are immutable** (no update, no delete) so a
  child-facing chat stays auditable.
- Everything else: denied. Unauthenticated requests are denied everywhere.

### Composite indexes
`dbmgr/firestore.indexes.json` is intentionally **empty**. Firestore creates single-field indexes
automatically, which covers the simple queries planned so far. Composite indexes are only
needed for a filter plus a sort on different fields, for example:

- `attempts` where `subject == X` ordered by `ts` (likely in prompt 08 stats)
- `attempts` where `grade == N && subject == X` ordered by `ts`
- `collaboration` where `participants array-contains uid` ordered by `createdAt` (prompt 09)

**TODO:** add these when the queries in prompts 08/09 are actually written. Firestore fails a
query that needs a missing composite index and prints a console link that creates it, so it is
better to add them from real queries than to guess now.

---

## 3. What is deliberately not here
- **Auth UI** (login/signup wiring): prompt 07.
- **Reads/writes from the app** (progress, stats): prompt 08.
- **Collaboration/chat features**: prompt 09. The rules exist already so the boundary is
  defined before any feature writes data.
- **Deploying rules to production**: prompt 14.
