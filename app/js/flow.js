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

/* Grade range the site serves. Grade 7 was added on 2026-09-02; the taxonomy already
   routed it (subtopicsForGrade sends anything above 5 to the extended 10-subtopic list),
   so only these bounds and the Firestore rules had to move.

   This lives here because SEVEN page modules each carried their own `grade >= 1 && grade <= 6`
   literal. One constant is what stops the next grade addition from missing one of them.
   `stats-calc.js` keeps its own copy — it is deliberately import-free so Node can unit-test
   it — and test_stats.test.js asserts the two agree. */
export const MIN_GRADE = 1;
export const MAX_GRADE = 7;

export function isValidGrade(grade) {
  return Number.isInteger(grade) && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

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
/* Markdown BACKSLASH ESCAPES — deliberately just `\_`.

   Authors write `\_\_\_\_` for a fill-in-the-blank so the underscores are not read as
   emphasis. Without this the child saw the backslashes on the live site (2026-09-01):

       generous is to \_\_\_\_\_\_\_\_

   NOTHING ELSE MAY BE UNESCAPED HERE. Almost every backslash in this corpus is LaTeX, not
   markdown: `\(` and `\)` appear 1313 times each as the inline-maths delimiters KaTeX looks
   for, alongside \frac, \times, \div, \pi and the rest. A general markdown unescape --
   which is what this started as -- turned `0.25 x \(80 = \)20` into `0.25 x (80 = )20` and
   would have broken maths in 303 items to fix 4.

   Maths spans are masked out first even so. All 32 `\_` in the corpus today sit outside
   maths, but a subscript like `x\_1` inside `\(...\)` is ordinary LaTeX and must survive. */
const MATH_SPAN = /\\\([\s\S]*?\\\)/g;
const ESCAPED_UNDERSCORE = /\\_/g;
const SLOT = '\u0000';

function unescapeOutsideMath(text) {
  const maths = [];
  // Park each maths span so the unescape below cannot reach inside it.
  const parked = text.replace(MATH_SPAN, (m) => {
    maths.push(m);
    return SLOT;
  });
  const unescaped = parked.replace(ESCAPED_UNDERSCORE, '_');
  let k = 0;
  return unescaped.replace(new RegExp(SLOT, 'g'), () => maths[k++]);
}

export function renderInline(s) {
  const esc = String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* Unescape LAST-but-one: after HTML escaping, before the emphasis passes, so `\_` becomes a
     plain underscore that the `*`-based emphasis rules never look at anyway. */
  return unescapeOutsideMath(esc)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

/* ---- block-level rendering ---------------------------------------------------------------

   renderInline above handles a run of text. It cannot handle the two BLOCK constructs the
   authored content actually uses, and both were reaching children as raw source:

     - GFM tables. 78 questions and 38 explanations contain one — data tables a child has to
       READ to answer ("Cube | Mass | Result in water"). Turning the newlines into <br> left a
       wall of pipes and dashes, which is worse than useless in a question about the data.
     - Fenced code blocks. 19 explanations lay out long division inside ```; collapsing that to
       <br>-separated proportional text destroys the column alignment that IS the explanation.

   Options are deliberately NOT run through this. They are single-line by construction, and the
   only pipes they contain are absolute-value maths — \(|-8| > |5|\) — which must never be
   mistaken for a table. Requiring a delimiter row (|---|) is what makes that safe. */

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DELIM = /^\s*\|[\s:|-]+\|\s*$/;

// | a | b |  ->  ['a', 'b']   (leading/trailing pipe dropped, not treated as empty cells)
function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/* GFM alignment markers on the delimiter row: :--- left, ---: right, :---: centre.

   Returns Bootstrap 5 class suffixes. NOT `text-left`/`text-right` -- those are Bootstrap 4
   names, dropped in 5, and the site loads 5.3.3. Getting this wrong fails silently: the class
   is emitted, matches no rule, and every number in a right-aligned column quietly stays left. */
function alignments(delim) {
  return splitRow(delim).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'end';
    if (left) return 'start';
    return '';
  });
}

function renderTable(rows, delim) {
  const align = alignments(delim);
  const cell = (tag, text, i) => {
    const a = align[i] ? ` class="text-${align[i]}"` : '';
    return `<${tag}${a}>${renderInline(text)}</${tag}>`;
  };
  const head = splitRow(rows[0]).map((c, i) => cell('th', c, i)).join('');
  const body = rows.slice(1)
    .map((r) => `<tr>${splitRow(r).map((c, i) => cell('td', c, i)).join('')}</tr>`)
    .join('');
  /* table-responsive so a wide table scrolls inside its own box instead of stretching the
     page sideways on a phone; w-auto so a three-column table does not span the full width and
     leave the numbers far from their labels. */
  return `<div class="table-responsive my-3">`
    + `<table class="table table-sm table-bordered align-middle w-auto mb-0">`
    + `<thead class="table-light"><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* Render authored content that may contain block constructs. Text between blocks still goes
   through renderInline, so bold/italic/code/newlines behave exactly as before — a string with
   no table and no fence renders identically to the old output. */
export function renderBlocks(src) {
  const lines = String(src == null ? '' : src).split('\n');
  const out = [];
  let text = [];

  const flushText = () => {
    const joined = text.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined.trim()) out.push(renderInline(joined));
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code: preserve it verbatim in a <pre>, which is the whole point of the fence.
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      flushText();
      const close = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(close)) buf.push(lines[i++]);
      const escaped = buf.join('\n')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      out.push(`<pre class="bg-light p-2 rounded small mb-3"><code>${escaped}</code></pre>`);
      continue;
    }

    /* A table needs BOTH a pipe row and a delimiter row under it. Without that second
       requirement, any sentence containing two pipes — absolute value, "a | b" — would be
       swallowed into a one-cell table. */
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1])) {
      flushText();
      const delim = lines[i + 1];
      const rows = [line];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(lines[i++]);
      i--; // the loop's i++ will step past the last consumed row
      out.push(renderTable(rows, delim));
      continue;
    }

    /* BLOCKQUOTE. Authors set the sentence or passage a question is ABOUT as a quote:

           Read the sentence below.

           > The hikers were **fatigued** after climbing for six hours.

           As used in the sentence, **fatigued** most nearly means —

       Without this the child saw a literal "&gt;" in front of the very text they had to read
       (reported on the live site, 2026-09-01). Consecutive `>` lines form one quote, and a
       blank `>` line separates paragraphs inside it, which is how markdown behaves. */
    if (/^\s*>\s?/.test(line)) {
      flushText();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      i--; // the loop's i++ steps past the last consumed line
      out.push('<blockquote class="blockquote border-start border-3 ps-3 my-3 fs-6">'
        + `${renderInline(buf.join('\n'))}</blockquote>`);
      continue;
    }

    text.push(line);
  }
  flushText();
  return out.join('');
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
