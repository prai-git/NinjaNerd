/* Idle-session policy — the pure half.

   Kept in its own module with NO imports so it can be genuinely unit-tested. Its sibling
   idle-timeout.js imports the Firebase SDK over https, which Node cannot resolve, so anything
   left in there is only checkable as text. The decision "is this child still here?" is the
   part worth testing, so it lives here.

   THE 30 MINUTES IS SOURCED, NOT CHOSEN. The legacy Flask app set

       session.permanent = True                                      (obs_app.py:679)
       PERMANENT_SESSION_LIFETIME = timedelta(minutes=30)            (obs_app.py:115)
       SESSION_TIMEOUT_MINUTES = 30       (obs_session_storage/session_expiry.py:15)

   and Flask refreshes a permanent session on every request by default, so what a student
   actually experienced was a ROLLING 30-minute idle timeout. Same number here, same
   behaviour. (30 minutes is also the ordinary figure for education platforms, so matching
   legacy costs nothing.)

   ONE DELIBERATE DIVERGENCE, flagged per the working rules. Legacy's clock was refreshed by
   HTTP requests — every page load and every answer submit. A static site makes no requests
   while a child reads a passage, so counting "requests" would log a slow reader out mid-
   question. This counts real user input instead (pointer, key, touch, scroll), which is
   strictly more generous than legacy and never less. */

export const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes — see header.

/* How long the warning stands before the sign-out actually happens. Legacy had no warning at
   all: expiry was decided server-side, so the first a student knew of it was a login page.
   That is bad for a child mid-quiz, so a countdown is added. It is carved OUT of the 30
   minutes rather than added on top — total time to sign-out stays exactly legacy's 30. */
export const WARN_BEFORE_MS = 2 * 60 * 1000; // last 2 of the 30

/* localStorage keys. The activity stamp is shared so that working in ONE tab keeps every
   other tab alive; without that, a second tab left open on the topics page would expire and
   sign the student out of the tab they are actually using. */
export const ACTIVITY_KEY = 'nn_last_activity';
export const LOGOUT_KEY = 'nn_idle_logout';

/* Writing localStorage on every mousemove would be a needless write storm. The stamp is
   flushed at most this often; against a 30-minute limit the lost precision is irrelevant. */
export const FLUSH_INTERVAL_MS = 15 * 1000;

/* The single decision. Split out so the thresholds are testable at their exact boundaries,
   which is where an off-by-one would hide.

   `lastActivity` is a ms epoch, or null/NaN when nothing has been recorded yet. A missing or
   unparseable stamp is treated as "active, starting now" rather than "expired": a student
   whose localStorage was cleared, or who is in private mode, must not be thrown out on their
   first page load. */
export function evaluate(lastActivity, now) {
  const stamp = Number(lastActivity);
  if (!Number.isFinite(stamp) || stamp <= 0) {
    return { state: 'active', msLeft: IDLE_LIMIT_MS, idleMs: 0 };
  }

  /* A stamp in the future means a clock change or a hand-edited value. Clamp instead of
     trusting it, or a skewed clock could hold a session open indefinitely. */
  const idleMs = Math.max(0, now - stamp);
  const msLeft = IDLE_LIMIT_MS - idleMs;

  if (msLeft <= 0) return { state: 'expired', msLeft: 0, idleMs };
  if (msLeft <= WARN_BEFORE_MS) return { state: 'warn', msLeft, idleMs };
  return { state: 'active', msLeft, idleMs };
}

/* Seconds remaining, for the countdown text. Rounded UP so the modal never shows "0 seconds"
   while the session is still alive. */
export function secondsLeft(msLeft) {
  return Math.max(0, Math.ceil(msLeft / 1000));
}

/* mm:ss for the countdown. A bare second count is fine at 120s but reads oddly; children
   parse a clock faster than a big number. */
export function formatCountdown(msLeft) {
  const total = secondsLeft(msLeft);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Should a flush be written yet? Keeps the throttle rule beside the interval it uses, so a
   test can pin the behaviour rather than inferring it from timer code. */
export function shouldFlush(lastFlush, now) {
  const prev = Number(lastFlush);
  if (!Number.isFinite(prev) || prev <= 0) return true;
  return now - prev >= FLUSH_INTERVAL_MS;
}
