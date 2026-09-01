/* Idle-session timeout — the wiring half. Policy lives in idle-core.js; see its header for
   where the 30 minutes comes from (the legacy Flask rolling session, not a guess).

   Started from js/auth.js, which every page already loads as a module. That is the whole
   reason it hooks in there: adding a <script> to eleven pages would guarantee that the twelfth
   page written later silently has no timeout.

   WHAT THIS IS AND IS NOT. Signing a student out on an idle shared classroom machine is the
   point. It is NOT a security boundary — a signed-out client is still just a client, and the
   Firestore rules on Google's servers are what actually protect data. Firebase's own ID token
   also keeps refreshing until signOut() is called, so the sign-out has to be real (it is:
   fbSignOut via NNAuthApi.logout), not merely a redirect. */

import {
  IDLE_LIMIT_MS, ACTIVITY_KEY, LOGOUT_KEY,
  evaluate, formatCountdown, shouldFlush,
} from './idle-core.js';

/* Events that count as "the child is here". Deliberately includes scroll and touch: on a
   tablet, reading a passage produces touch/scroll and nothing else. `keydown` rather than
   `keypress` so modifier and arrow keys count. */
const ACTIVITY_EVENTS = [
  'mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart', 'click',
];

let armed = false;        // only true while a user is actually signed in
let warning = false;      // the modal is up
let lastFlush = 0;
let tickHandle = null;
let modalEl = null;

function now() {
  return Date.now();
}

function readStamp() {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY));
  } catch (e) {
    return NaN; // private mode — evaluate() treats this as "active, starting now"
  }
}

function writeStamp(value) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(value));
  } catch (e) { /* private mode: the in-tab timer still works, just not across tabs */ }
}

/* Record activity. Throttled, because mousemove fires continuously and localStorage is
   synchronous — writing on every event would jank the page for no gain against a 30-minute
   limit.

   While the warning is up this does NOTHING. That is intentional: if a stray mousemove could
   silently cancel the countdown, a student would never learn the session was about to end,
   and a jiggling mouse on a classroom desk would hold the session open forever. Dismissing
   the warning takes a deliberate click. */
function noteActivity(force) {
  if (!armed || warning) return;
  const t = now();
  if (!force && !shouldFlush(lastFlush, t)) return;
  lastFlush = t;
  writeStamp(t);
}

// ---- the warning modal ----------------------------------------------------------------
// Built in JS rather than added to eleven page templates: the markup would have to be kept
// identical across all of them, and a page that missed it would warn with nothing visible.
function ensureModal() {
  if (modalEl) return modalEl;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="nn-idle-modal" tabindex="-1" role="dialog"
         aria-labelledby="nn-idle-title" aria-live="assertive" data-bs-backdrop="static"
         data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header bg-warning">
            <h5 class="modal-title" id="nn-idle-title">
              <i class="fas fa-clock me-2"></i>Are you still there?
            </h5>
          </div>
          <div class="modal-body text-center">
            <p class="mb-2">You have not done anything for a while, so we are about to sign
              you out to keep your account safe.</p>
            <p class="display-6 mb-0"><span id="nn-idle-countdown">2:00</span></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="nn-idle-signout">
              Sign out now
            </button>
            <button type="button" class="btn btn-primary" id="nn-idle-stay">
              <i class="fas fa-check me-1"></i>I'm still here
            </button>
          </div>
        </div>
      </div>
    </div>`;
  modalEl = wrap.firstElementChild;
  document.body.appendChild(modalEl);

  modalEl.querySelector('#nn-idle-stay').addEventListener('click', dismissWarning);
  modalEl.querySelector('#nn-idle-signout').addEventListener('click', () => expire(false));
  return modalEl;
}

function bsModal() {
  const el = ensureModal();
  // Bootstrap is a CDN global on every page; if it failed to load, fall back to plain display
  // so the warning is still visible rather than silently absent.
  if (window.bootstrap && window.bootstrap.Modal) {
    return window.bootstrap.Modal.getOrCreateInstance(el);
  }
  return {
    show() { el.classList.add('show'); el.style.display = 'block'; },
    hide() { el.classList.remove('show'); el.style.display = 'none'; },
  };
}

function showWarning() {
  if (warning) return;
  warning = true;
  bsModal().show();
}

function dismissWarning() {
  if (!warning) return;
  warning = false;
  bsModal().hide();
  lastFlush = 0;
  noteActivity(true); // explicit "I'm here" resets the full 30 minutes
}

/* End the session. `wasIdle` distinguishes the timeout from the modal's own "Sign out now"
   button, purely so the login page can explain what happened. */
function expire(wasIdle = true) {
  if (!armed) return;
  armed = false;
  warning = false;
  if (modalEl) bsModal().hide();

  try {
    localStorage.removeItem(ACTIVITY_KEY);
    // Tell sibling tabs, so a student mid-quiz in another tab is not left on a page whose
    // writes have started failing with no explanation.
    if (wasIdle) localStorage.setItem(LOGOUT_KEY, String(now()));
  } catch (e) { /* private mode */ }

  // The real sign-out. A redirect alone would leave the Firebase session alive.
  try {
    if (window.NNAuth && window.NNAuth.signOut) window.NNAuth.signOut();
    else if (window.NNAuthApi && window.NNAuthApi.logout) window.NNAuthApi.logout();
  } catch (e) { /* fall through to the redirect regardless */ }

  const next = location.pathname + location.search;
  // No leading slash: paths resolve against <base>, which differs between the
  // project-pages sub-path and the custom domain. See CLAUDE.md.
  location.href = `pages/login.html?timeout=${wasIdle ? 1 : 0}&next=${encodeURIComponent(next)}`;
}

/* The clock. Driven by an interval rather than a single setTimeout for the machine-sleep
   case: a laptop closed for an hour suspends timers, so a lone setTimeout fires late and a
   long-past expiry would be missed. Comparing against the stored stamp on every tick means
   the session is correctly found expired the moment the machine wakes. */
function tick() {
  if (!armed) return;
  const { state, msLeft } = evaluate(readStamp(), now());

  if (state === 'expired') { expire(true); return; }

  if (state === 'warn') {
    showWarning();
    const el = document.getElementById('nn-idle-countdown');
    if (el) el.textContent = formatCountdown(msLeft);
    return;
  }

  // Back to active — another tab recorded activity while this one sat idle.
  if (warning) { warning = false; bsModal().hide(); }
}

export function start() {
  if (tickHandle) return;
  for (const ev of ACTIVITY_EVENTS) {
    // Passive: these listeners never preventDefault, and marking them so keeps scrolling
    // smooth on touch devices.
    document.addEventListener(ev, () => noteActivity(false), { passive: true, capture: true });
  }

  /* Returning to the tab is activity, and is also the moment to re-check after a sleep. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });

  window.addEventListener('storage', (e) => {
    if (e.key === LOGOUT_KEY && armed) expire(true); // another tab timed out
  });

  tickHandle = setInterval(tick, 1000);
}

/* Arm/disarm on auth state. Called from js/auth.js. Signed-out visitors browsing the public
   About page have no session to expire, so the timer stays idle for them. */
export function setSignedIn(isSignedIn) {
  if (isSignedIn && !armed) {
    armed = true;
    lastFlush = 0;
    start();

    /* The stamp must NOT simply be refreshed here. Firebase restores a session when the
       browser reopens, so this runs again on a cold start — and a browser closed for an hour
       is exactly the case that has to expire. Legacy behaved that way too: the Flask cookie
       carried a 30-minute lifetime, so reopening later landed on the login page.

       Refreshing unconditionally would also mean every page navigation reset the clock, and a
       student clicking around topics without answering anything would never time out. */
    const stamp = readStamp();
    if (!Number.isFinite(stamp) || stamp <= 0) {
      noteActivity(true); // fresh sign-in: start the window now
    } else if (evaluate(stamp, now()).state === 'expired') {
      expire(true);       // restored session that had already gone stale
    }
  } else if (!isSignedIn && armed) {
    armed = false;
    warning = false;
    if (modalEl) bsModal().hide();
    /* Drop the stamp on any sign-out, including a deliberate one. Leaving it behind would
       carry a stale timestamp into the NEXT sign-in, and the branch above would read it as an
       already-expired session and bounce the student straight back to the login page. */
    try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) { /* private mode */ }
  }
}

// Exposed for the login page's "you were signed out" notice and for manual checks.
window.NNIdle = { IDLE_LIMIT_MS, setSignedIn, start };
