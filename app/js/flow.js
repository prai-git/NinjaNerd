/* Shared flow helpers (prompt 04) used by the topics/subtopics/explore/learn/
   practice pages. Query-param parsing, the login gate (login is required only
   when a student starts Learn or Practice — browsing is public), subject
   metadata, and a minimal safe inline-markdown renderer. */

// Icons/colors/descriptions mirror the legacy topics.html cards.
export const SUBJECTS = {
  math: { label: 'Math', icon: 'fa-calculator', color: 'primary', desc: 'Mathematical problems and concepts' },
  english: { label: 'English', icon: 'fa-language', color: 'success', desc: 'Grammar, vocabulary, and writing' },
  science: { label: 'Science', icon: 'fa-microscope', color: 'danger', desc: 'Scientific concepts and experiments' },
};

export function subjectLabel(subject) {
  return (SUBJECTS[subject] && SUBJECTS[subject].label) || (subject || '');
}

export function params() {
  return new URLSearchParams(location.search);
}

export function param(name) {
  return params().get(name);
}

// Login gate. Public browsing is allowed up to the point of starting an activity;
// call this when the student commits to Learn/Practice. Returns true if signed in,
// otherwise redirects to login with a return URL and returns false.
export function requireLogin(returnUrl = location.pathname + location.search) {
  const user = window.NNAuth && window.NNAuth.getUser();
  if (!user) {
    location.href = `pages/login.html?next=${encodeURIComponent(returnUrl)}`;
    return false;
  }
  /* Verification gate. Legacy checked a 4-digit code BEFORE writing the user row, so an
     unverified account could not exist; Firebase creates first and verifies after, so the
     check has to live here instead. Signed-in-but-unverified may browse, but not start an
     activity — same end state as legacy, enforced at a different point.

     This is a UX gate, not a security boundary: it reads the display cache, which anyone can
     edit. Nothing here protects data; the Firestore rules do that. Prompt 08 must ALSO refuse
     to write history for an unverified user rather than relying on this. */
  if (user.emailVerified === false) {
    if (window.NNToast) {
      window.NNToast.show(
        'Please verify your email before starting. Check your inbox for the link.', 'warning',
      );
    }
    return false;
  }
  return true;
}

// Minimal, safe inline renderer: escape HTML, then **bold**/*italic*/`code` and
// newlines. LaTeX ($…$) is left literal for now (KaTeX is a later polish).
export function renderInline(s) {
  const esc = String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

/* Emit an attempt result: persist it, and broadcast it for anything listening.

   The old localStorage mirror is gone. It existed only as a stand-in until Firestore arrived,
   and keeping it would leave a second, unauthenticated copy of every child's answers sitting
   in the browser with nothing reading it. */
export function emitAttempt(result) {
  /* Persist to Firestore (prompt 08). data.js is imported lazily so the practice page still
     works if Firebase is unreachable — a child mid-quiz must never be blocked by a failed
     write, and recordAttempt already swallows its own errors. */
  import('./data.js')
    .then((m) => m.recordAttempt(result))
    .catch((e) => console.warn('[NinjaNerd] persistence unavailable:', e && e.message));

  document.dispatchEvent(new CustomEvent('nn-attempt', { detail: result }));
}
