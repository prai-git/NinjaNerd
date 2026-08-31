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

The model **mirrors the legacy SQLite schema** (`dbmgr/obs_sqlite_manager.py`) so Audit,
Statistics and progress tracking behave exactly as they did in the Flask app. Legacy table
names are shown against each collection.

```
users/{uid}                             <- users
  email                    : string     # also the login identifier
  school_name              : string     # optional, from the signup form
  is_admin                 : boolean    # IMMUTABLE from the client; granted in the console
  created_at               : timestamp
  updated_at               : timestamp
  # `password` is gone: Firebase Auth owns credentials.

users/{uid}/history/{autoId}            <- user_history
  question                 : string     # the question text, as the legacy column stored it
  user_answer              : string
  correct                  : boolean
  topic                    : string     # "math" | "english" | "science"
  subtopic                 : string
  grade                    : number     # 1-6
  timestamp                : timestamp

users/{uid}/statistics/summary          <- user_statistics + JSON store
  last_login               : timestamp   # from the SQLite user_statistics table
  questions_attempted      : number      # NOT in SQLite; from obs_db_manager.py JSON store
  topics_covered           : string[]    # NOT in SQLite; from obs_db_manager.py JSON store

invites/{inviteId}                      <- invites
  from_user_id                 : string     # was from_user_id
  to_user_email            : string     # recipient identified by email
  status                   : string     # "pending" | "accepted" | "declined"
  timestamp, created_at, updated_at : timestamp

chat_sessions/{sessionId}               <- chat_sessions
  user1_id, user2_id       : string     # uids
  active                   : boolean
  created_at, updated_at   : timestamp

chat_sessions/{sessionId}/messages/{autoId}   <- messages
  from_user_id, to_user_id : string     # uids
  message_content          : string
  obfuscated_content       : string     # see obs_core/message_security.py
  displayed                : boolean    # per-message read flag
  timestamp                : timestamp
```

**On `statistics`:** the legacy app had **two** storage backends. The SQLite
`user_statistics` table holds only `user_id` + `last_login`, while the JSON store
(`dbmgr/obs_db_manager.py`) holds `questions_attempted` and `topics_covered[]`. The Audit page
reads **all three**, so this single document is the union of both — it is not a copy of the
SQLite table alone.

**Two deliberate adaptations** (flagged, not invented):
- Integer `user_id` foreign keys become Firebase Auth **uid** strings.
- `messages` was a top-level table keyed by `session_id`; here it is a **subcollection** of the
  session. Same relationship, and it lets the rules scope messages to their session.

**Dropped:** `user_payments` (no payments on the static site) and `email_verification_codes`
(Firebase Auth handles verification). `schema_info` is not needed: Firestore is schemaless.

### Access summary (enforced by `dbmgr/firestore.rules`)
- `users/{uid}`, its `history` and its `statistics`: the owner always; **an admin may read any
  user**, because the legacy Audit page looks a user up by email and displays their history and
  statistics. Admin read covers both `get` and `list` so that email query works.
- **`is_admin` and `email` cannot be changed by the client, and a new account cannot create
  itself as admin.** Admin is granted only from the Firebase console. Without this, any account
  could promote itself and read every child's history.
- `history` entries are **append-only** (no client update or delete) since Audit treats them as
  a trail.
- `invites`: readable by sender, by the recipient (matched on `request.auth.token.email`), and
  by an admin. Neither party can rewrite who the invite is from or to.
- `chat_sessions`: readable and updatable only by `user1_id`/`user2_id`; the pairing itself is
  fixed once created.
- `messages`: readable and creatable only by the two session members, and you may only send as
  yourself. `message_content`, `from_user_id` and `to_user_id` are immutable, so only the
  `displayed` read-flag can change. **No deletes.**
- Everything else: denied. Unauthenticated requests are denied everywhere.

### How admin works without a server
Legacy admin was the hard-coded account `admin@gmail.com` (`obs_app.py:is_admin_user`), with an
`is_admin` column on `users`. A static site has no server able to mint Firebase custom claims,
so the rules read `is_admin` from the requester's own user document. That is only safe because
the field is immutable from the client. **To make someone an admin:** open the Firestore console
and set `is_admin: true` on their `users/{uid}` document by hand.

### Composite indexes
`dbmgr/firestore.indexes.json` is intentionally **empty**. Firestore creates single-field
indexes automatically, which covers the simple queries planned so far. Composite indexes are
only needed for a filter plus a sort on different fields, for example:

- `history` where `topic == X && grade == N` ordered by `timestamp` (the Statistics page
  computes percent-correct per topic for one grade, so this is likely)
- `invites` where `to_user_email == X && status == "pending"`
- `chat_sessions` where `user1_id == uid` / `user2_id == uid` ordered by `updated_at`

**TODO:** add these when the queries in prompts 08/09 are actually written. Firestore fails a
query that needs a missing composite index and prints a console link that creates it, so it is
better to add them from real queries than to guess now.

## 3. What is deliberately not here
- **Auth UI** (login/signup wiring): prompt 07.
- **Reads/writes from the app** (progress, stats): prompt 08.
- **Collaboration/chat features**: prompt 09. The rules exist already so the boundary is
  defined before any feature writes data.
- **Deploying rules to production**: prompt 14.
