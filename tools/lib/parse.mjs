/* Dev-time parser for authored question/answer markdown (prompt 03).
   Pure functions, no I/O — the build script (build-content.mjs) reads files
   and passes strings in. Handles two authored formats:
     - MAP/STAAR "already-MCQ": `## Question N *(TEKS ...)*` + `- **A.** ...`
     - Legacy free-response:    `## Section A: Topic` + `**Question N**` (no options)
*/

export function clean(s) {
  return String(s == null ? '' : s).trim();
}

export function slug(s) {
  return clean(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';
}

// practice_questions_<subject>[_map|_staar][_boy[_moy[_eoy]]]_<date>_<time>[-g<N>].(md|html)
// The optional trailing `-g<N>` (or `_g<N>`) marks the grade when several sets share a
// date/time stamp; it must be part of the match or date/time fall back to null and item
// ids collapse to `<subject>_x_x_qN`, which collides across files.
export function parseFilename(filename) {
  const base = String(filename).replace(/^.*\//, '').replace(/\.(md|html)$/i, '');
  const m = base.match(
    /^(?:practice_questions|answers)_([a-z]+)(?:_(map|staar))?((?:_(?:boy|moy|eoy))*)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})(?:[-_]g(\d+))?$/i
  );
  if (!m) {
    const parts = base.split('_');
    return { subject: (parts[2] || null), test: null, phase: null, date: null, time: null, grade: null };
  }
  const phase = m[3] ? m[3].replace(/^_/, '').toLowerCase() : '';
  return {
    subject: m[1].toLowerCase(),
    test: m[2] ? m[2].toLowerCase() : null,
    phase: phase || null,
    date: m[4],
    time: m[5],
    grade: m[6] ? Number(m[6]) : null,
  };
}

/* Headings that structure a document rather than name its topic. Treating one of these as a
   subtopic silently mislabels a whole file: `## Questions` in the grade-5 personal financial
   literacy set produced a subtopic literally called "Questions" for 19 items, hiding what they
   were actually about. When a heading is one of these, keep the current subtopic (usually the
   document title) instead of overwriting it. */
const STRUCTURAL_HEADING =
  /^(questions?|answers?|answer\s+(sheet|key)|concept\s+review|review|instructions?|directions?|overview|introduction|notes?|scoring|rubric|materials|contents?|table\s+of\s+contents)$/i;

/* "### Read the story." and friends introduce passage text INSIDE a single question, rather
   than starting a new section. Widening the heading match to H3 (to catch STAAR's
   "### Section 1: ...") made these terminate the question they belonged to, losing its stem
   and options -- 15 grade-2 English items vanished that way. They are skipped entirely: the
   prose beneath simply continues to flow into the open question. */
const INLINE_INSTRUCTION_HEADING =
  /^read\s+(the|this|these)\b|^use\s+the\b|^based\s+on\b|^refer\s+to\b/i;

/* A heading that names a question range is a LABEL pointing at the passage above, not a
   section break:  "### Questions 1-8: Refer to 'The Printing Press'".  Treating it as a break
   ended the passage's scope and orphaned every question under it. */
const QUESTION_RANGE_HEADING = /^questions?\s+\d+\s*[\u2013\u2014-]/i;

/* Some sets list EVERY passage first and then group the questions by back-reference:

     ## Passage 1 - Informational Text: *The Map of Cool Places*
     ...
     ## Questions 1-8 - Passage 1          <- points back at Passage 1

   Positional scoping cannot resolve that, so passages are also indexed by title and a
   trailing reference on a question-range heading is looked up. Without it every question in
   such a file is orphaned -- "In Passage 1, revealed means-" is unanswerable on its own. */
const QUESTION_RANGE_REF =
  /^questions?\s+[\d\s,\u2013\u2014-]+(?:[\u2013\u2014-]|:)\s*(.+)$/i;

// "Passage 1", "Passage 6A", "The Printing Press" -> a stable lookup key.
export function passageKey(title) {
  const t = clean(title)
    .replace(/[*_`]/g, '')
    // "Questions 1-8: Refer to \"The Printing Press\"" -> "The Printing Press"
    .replace(/^refer\s+to\s*/i, '')
    .replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '')
    .trim();
  const m = t.match(/passage\s+([0-9]+[A-Za-z]?)/i);
  return m ? `passage ${m[1].toLowerCase()}` : t.toLowerCase();
}

export function isStructuralHeading(s) {
  return STRUCTURAL_HEADING.test(clean(s).replace(/[:.\-—\s]+$/, ''));
}

// Normalize a raw header line into a clean subtopic label.
export function cleanSubtopic(s) {
  let t = clean(s);
  t = t.replace(/^Section\s+[A-Za-z0-9]+\s*[:.\-—]\s*/i, '');
  t = t.replace(/^Instructional Area:\s*/i, '');
  t = t.replace(/^Unit\s+\d+\s*[—:\-]\s*/i, '');
  t = t.replace(/\s*[—-]\s*TEKS[^—]*$/i, '');
  t = t.replace(/\s*\(TEKS[^)]*\)\s*$/i, '');
  return t.trim() || 'General';
}

export function parseGrade(md) {
  const h1 = (md.match(/^#\s+(.+)$/m) || [])[1] || '';
  let m = h1.match(/(\d+)\s*(?:st|nd|rd|th)\s+Grade/i) || h1.match(/Grade\s+(\d+)/i);
  if (m) return Number(m[1]);
  m = md.match(/\*\*Grade:\*\*\s*(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

// Strip "5th Grade Math -" style prefixes so the H1 yields the topic, not the grade/subject.
export function subtopicFromTitle(md) {
  const h1 = (String(md).match(/^#\s+(.+)$/m) || [])[1];
  if (!h1) return null;
  const t = clean(h1)
    .replace(/^\d+\s*(?:st|nd|rd|th)?\s*Grade\s*/i, '')
    .replace(/^Grade\s+\d+\s*/i, '')
    .replace(/^(Math|Mathematics|English|ELAR|Reading|Science)\s*/i, '')
    .replace(/^[\s:.\-\u2013\u2014]+/, '')
    .replace(/\s*[\u2013\u2014-]\s*(STAAR|MAP)\b.*$/i, '');
  return t.trim() ? cleanSubtopic(t) : null;
}

// Prose under a heading only counts as a passage if there is a real amount of it; a one-line
// instruction like "*Read the passage below.*" is not a passage.
const PASSAGE_MIN_CHARS = 200;

export function parseQuestions(md) {
  const lines = String(md).split(/\r?\n/);
  const questions = [];
  // Falls back to the document title; a structural heading must not overwrite it.
  let subtopic = subtopicFromTitle(md);
  let cur = null;
  let skipping = false;
  // The current reading passage, applied to every question until the next passage or area.
  let passage = null;
  let passageTitle = null;
  // A non-question heading whose role is not yet known -- see the comment at its match site.
  let pendingHeading = null;
  let pendingProse = [];
  // Heading depth, used to decide when a passage's scope ends -- see flushPending.
  let passageLevel = 0;
  let pendingLevel = 0;
  /* Set when the author has just written "Read the poem/story below". What follows is a
     passage by declaration, however short — a four-line poem is well under the length that
     otherwise distinguishes a passage from a section label. */
  let expectPassage = false;
  // Every passage seen so far, so a later "Questions 1-8 - Passage 1" can find it.
  const passagesByKey = new Map();

  /* Settle a held heading.

     A heading ALWAYS names the subtopic. Whether it also carries a reading passage depends on
     what follows it: enough prose means a passage, none means it is just a section label.

     The subtlety is SCOPE. In the STAAR format a passage heading is followed by deeper section
     headings whose questions still refer to that passage:

         ## Reading Passage 1 - Informational Text   <- passage, level 2
         ### Section 1: Vocabulary and Word Study    <- subtopic, level 3, SAME passage
         ## Question 1 ...                           <- belongs to Passage 1
         ## Reading Passage 2 - Literary Fiction     <- level 2, REPLACES the passage

     So a heading at the same or shallower level than the passage's ends its scope; a deeper
     one does not. Clearing on every heading dropped Passage 1 from twelve questions. */
  const flushPending = () => {
    if (pendingHeading === null) return;
    const prose = pendingProse.join('\n').trim();
    subtopic = cleanSubtopic(pendingHeading);
    // A declared passage counts whatever its length; otherwise it must be substantial.
    const isPassage = prose.length >= (expectPassage ? 20 : PASSAGE_MIN_CHARS);
    expectPassage = false;
    if (isPassage) {
      passage = prose;
      passageTitle = pendingHeading;
      passageLevel = pendingLevel;
      const entry = { text: prose, title: pendingHeading };
      passagesByKey.set(passageKey(pendingHeading), entry);
      /* Also index the FULL title. A group heading may name the passage descriptively rather
         than by number — "## Questions 28-34 - Argument" points at
         "## Passage 5 - Argumentative Text: A Saturday Tool Share". Without a title index that
         question is orphaned. */
      passagesByKey.set(clean(pendingHeading).toLowerCase(), entry);
    } else if (passage !== null && pendingLevel <= passageLevel) {
      passage = null;
      passageTitle = null;
    }
    pendingHeading = null;
    pendingProse = [];
  };

  const pushCur = () => {
    if (cur) {
      cur.text = stripStandardsAnnotation(cur.textLines.join('\n').trim());
      delete cur.textLines;
      questions.push(cur);
    }
    cur = null;
  };

  for (const line of lines) {
    let m;
    // A blank "Answer Sheet" grid usually trails the paper, so stop there. Some sets
    // put it at the TOP instead — breaking then would yield zero questions, so skip
    // the section and resume at the next heading.
    if (/^#{1,3}\s+(Answer\s+Sheet|Answer\s+Key)\b/i.test(line)) {
      pushCur();
      if (questions.length) break;
      skipping = true;
      continue;
    }
    if (skipping) {
      if (!/^#{1,3}\s+/.test(line)) continue;
      skipping = false;
    }
    if ((m = line.match(/^#\s+Instructional Area:\s*(.+)$/i))) {
      // A new Instructional Area (level 1) always ends any passage scope.
      pushCur(); flushPending();
      subtopic = cleanSubtopic(m[1]); passage = null; passageTitle = null; passageLevel = 0;
      continue;
    }

    /* A non-question H2/H3 is AMBIGUOUS: it may name a subtopic, or it may title a reading
       passage. Both formats in doc/questionnaire/ use the same syntax:

         ## Reading Passage 1 - Informational Text   (STAAR)   -> passage
         ## The First Bowl                           (MAP)     -> passage
         ### Section 1: Vocabulary and Word Study     (STAAR)   -> subtopic

       They are told apart by what FOLLOWS: a passage heading is followed by prose, a subtopic
       heading runs straight into the next question. Treating every such heading as a subtopic
       dropped 175 questions' passages and turned passage titles ("The First Bowl", "The Old
       Kite") into subtopic names. So the heading is held pending until the next heading
       decides, and any prose collected in between becomes the passage. */
    if ((m = line.match(/^#{2,3}\s+(.+)$/)) && !/^Question\s+\d+/i.test(m[1]) && !/^Answer(\s|$)/i.test(m[1])) {
      // Not a section break: drop the heading and keep the question open.
      if (INLINE_INSTRUCTION_HEADING.test(m[1])) {
        /* "### Read the story." can appear INSIDE a question (its passage) or BETWEEN
           questions (introducing the next one's). A question that already has its four
           options is finished, so close it — otherwise the passage that follows is appended
           to the previous question's text, where nothing will ever show it. */
        if (cur && (cur.options || []).length >= 4) pushCur();
        expectPassage = true;
        continue;
      }
      if (QUESTION_RANGE_HEADING.test(m[1])) {
        // "Questions 1-8 - Passage 1": adopt the referenced passage if we have already seen it.
        pushCur();
        // Settle the held heading FIRST: flushPending is what registers a passage, so looking
        // up before it can never find a passage that was declared immediately above.
        flushPending();
        let ref = m[1].match(QUESTION_RANGE_REF);
        /* A bare range like "### Questions 1-8" has no reference. The regex backtracks and
           captures the trailing digit ("8"), which then looks like a section name and wiped
           the passage for 11 grade-3 items. A purely numeric tail is not a reference. */
        if (ref && /^[\d\s,.\u2013\u2014-]+$/.test(ref[1])) ref = null;
        let hit = ref && passagesByKey.get(passageKey(ref[1]));
        if (!hit && ref) {
          /* Descriptive reference: match it against the indexed titles. Require the reference
             to be a reasonably specific word so "Passage" alone cannot match everything. */
          const needle = clean(ref[1]).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
          if (needle.length >= 4) {
            for (const [k, v] of passagesByKey) {
              if (k.includes(needle) || needle.includes(k.replace(/^passage /, ''))) { hit = v; break; }
            }
          }
        }
        if (hit) {
          passage = hit.text;
          passageTitle = hit.title;
          /* The subtopic must follow the passage too. Otherwise every question in a
             passages-first file inherits whatever heading happened to come last -- grade 4
             English collapsed into a single grammar subtopic that way. */
          subtopic = cleanSubtopic(hit.title);
        } else if (ref && !/passage|poem|story|refer|["'\u201c\u2018]/i.test(ref[1])) {
          /* A group naming a real section rather than reading material — "Questions 41-46 -
             Language, Writing, and Research" — ends the passage scope, or those questions
             inherit the previous passage's topic.

             A group that DOES name reading material but whose lookup missed must leave the
             passage alone. Clearing on any miss dropped ~75 passages: a label like
             "Questions 9-18: Refer to 'The Last Recording'" is pointing AT the passage. */
          subtopic = cleanSubtopic(ref[1]);
          passage = null;
          passageTitle = null;
        }
        continue;
      }
      pushCur();
      flushPending();
      if (!isStructuralHeading(m[1])) {
        pendingHeading = clean(m[1]);
        pendingLevel = (line.match(/^(#+)/) || ['', '##'])[1].length;
        pendingProse = [];
      }
      continue;
    }

    if ((m = line.match(/^#{2,3}\s+Question\s+(\d+)\b(.*)$/i)) ||
        (m = line.match(/^\*\*Question\s+(\d+)\*\*\s*(.*)$/i))) {
      pushCur();
      // Reaching a question settles what the held heading was.
      flushPending();
      const tail = m[2] || '';
      const teks = tail.match(/TEKS\s+[^)*\]]+/i);
      cur = {
        number: Number(m[1]), subtopic, teks: teks ? clean(teks[0]) : null,
        // Carried so the question can be shown with the text it asks about.
        passage, passageTitle,
        textLines: [], options: [],
      };
      const rest = tail
        .replace(/\[(?:BOY|MOY|EOY)\]/gi, '')
        .replace(/\*?\(([^)]*)\)\*?/g, '')
        .trim();
      if (rest) cur.textLines.push(rest);
      continue;
    }

    // Lines under a held heading are candidate passage prose.
    if (!cur && pendingHeading !== null) {
      if (!/^\s*---\s*$/.test(line)) pendingProse.push(line);
      continue;
    }
    if (!cur) continue;

    // Options appear plain (`A. text`), bold (`**A.** text`), or as bullets (`- A) text`).
    if ((m = line.match(/^\s*-?\s*\*\*([A-D])[.)]\*\*\s*(.*)$/)) ||
        (m = line.match(/^\s*(?:[-*]\s+)?([A-D])[.)]\s+(.*)$/))) {
      cur.options.push({ letter: m[1].toUpperCase(), text: clean(m[2]) });
      continue;
    }

    if (/^\s*---\s*$/.test(line)) continue;
    cur.textLines.push(line);
  }
  pushCur();
  flushPending();
  return questions;
}

/* Drop a leading curriculum-standard annotation from a question.

   50 questions began with an authoring line like
       *MAP Instructional Area: Earth & Space Science | TEKS 2.10B,2.1F*
   and it was being shown to the child as the first line of the question. It is authoring
   provenance, not something a 7-year-old should read -- and the pipe in it also looked like
   stray table syntax, which is how it was found.

   The rule requires BOTH wholly-italic AND a named standards taxonomy. Stripping every
   wholly-italic first line would have been wrong: one question opens with
       *The pond wears a purple coat,*
   which is a line of POETRY the question asks about. Checked across the whole corpus -- 45
   distinct italic opening lines, 44 name a standard, and that one does not.

   Bold is accepted as well as italic: 133 more questions open with `**TEKS 3.6H [R] --
   inference**`. The keyword requirement matters just as much there -- the wholly-bold openings
   that do NOT name a standard are `**Notice 1: Window Feeder**` (a document the question asks
   about) and the difficulty labels `**[stretch]**` / `**[Honors research item]**`, none of
   which this may touch. */
const STANDARDS_LINE =
  /^\s*\*{1,2}(?=[^*\n]*\b(?:TEKS|MAP|NWEA|STAAR|Readiness|Instructional Area)\b)[^*\n]+\*{1,2}\s*$/im;

export function stripStandardsAnnotation(text) {
  const lines = String(text).split('\n');
  if (lines.length && STANDARDS_LINE.test(lines[0])) {
    return lines.slice(1).join('\n').trim();
  }
  return String(text).trim();
}

/* ---- EXPLANATION CLEANUP (2026-09-01) ---------------------------------------------------

   Three defects found by rendering the whole corpus and reading the output. All three come
   from the authoring format leaking into text a CHILD reads after answering wrongly.

   Kept deliberately separate from stripStandardsAnnotation above, which only ever examines
   line 1 of a QUESTION. That is right for questions -- the standard sits in the heading -- and
   it is exactly why explanations slipped through: they put the answer key on line 1 and the
   standard on line 2, so nothing ever looked at it. */

/* A standards annotation ANYWHERE in an explanation, not just on its first line.

   Two shapes, and both are deliberately narrow:
     **MAP area / TEKS:** Reading Foundations; 1.2A(ii).   <- bold LABEL, then a value
     **TEKS:** 5.4                                          <- same
     **TEKS 3.6H [R] -- inference**                         <- fully bold, no colon

   The keyword must sit inside a LABEL -- text before a colon, or a wholly bold line. That is
   what protects real teaching prose: the corpus contains an explanation reading "...ice is the
   classic STAAR example", and a rule that merely looked for the keyword would delete that
   sentence. It is also why "**Topic:** Finding Percent Discount" survives -- a sub-skill name
   is not a standard.

   Case-SENSITIVE. These are acronyms and proper nouns, and matching case-insensitively would
   let "MAP area" hit the phrase "map area" in a geometry explanation. */
const STD_KEY = '(?:TEKS|MAP area|NWEA|STAAR|Readiness|Instructional Area)';
const STANDARDS_ANYWHERE = new RegExp(
  '^[ \\t]*(?:'
  // bold-or-plain label containing the keyword, ending in a colon, then its value
  + `\\*{0,2}[^:\\n]{0,60}\\b${STD_KEY}\\b[^:\\n]{0,60}:\\*{0,2}[^\\n]*`
  + '|'
  // a wholly bold line naming the standard, with no colon
  + `\\*\\*[^*\\n]*\\b${STD_KEY}\\b[^*\\n]*\\*\\*`
  + '|'
  /* a line OPENING with a bold standard label, then prose:
       **TEKS 6.12B** -- Ecological relationships (competition)
     The keyword must be inside the leading bold span, which is what keeps
     "**Key concept:** ... the classic STAAR example." -- bold label without a keyword -- safe. */
  + `\\*\\*[^*\\n]*\\b${STD_KEY}\\b[^*\\n]*\\*\\*[^\\n]*`
  + ')[ \\t]*$',
  'gm',
);

/* The answer-key line: "**Correct answer: B. sock**", "**Correct Answer:** A) The bird sings".

   REMOVED ENTIRELY, not repaired. Both views already render the correct answer on their own,
   from options[correctIndex], which stays right after the shuffle -- so this line is redundant
   even when it is accurate. And it usually is not: practice shuffles the options, the text
   does not move with them, and across 3000 trials the letter it names was wrong 78% of the
   time. A child who answers incorrectly was being told the right answer is a letter that is
   not the right answer. */
const ANSWER_KEY_LINE =
  /^[ \t]*\*{0,2}Correct\s+Answer\b[^\n]*$/gim;

/* The same claim as a trailing SENTENCE rather than a line: "Therefore, **C** is the best
   answer." -- 50 items, all one template. Removed for the same reason: the page already shows
   the correct answer from options[correctIndex], and this names a letter the shuffle moved. */
const ANSWER_KEY_SENTENCE =
  /[ \t]*(?:Therefore|Thus|So|Hence)[,;]?[ \t]+\*{0,2}[A-D][).]?\*{0,2}[ \t]+is[ \t]+the[ \t]+(?:best|correct|right)[ \t]+answer[.!]?/gi;

/* Option letters used as labels in prose: "**B** bird sing does not agree", "A *map* begins
   /m/; C *top* begins /t/".

   The surrounding sentence is genuine teaching content and is kept; only the label is dropped,
   because after the shuffle it points at the wrong option. Restricted to forms that cannot be
   ordinary English: a BOLD lone letter, or a letter followed by ) or . at the start of a list
   item, or a letter introducing an italic run right after "wrong:" or a semicolon. The bare
   article "A" in "A number n is greater than 15" matches none of these. */
function stripOptionLabels(text) {
  return String(text)
    /* Strip the label ONLY where the option TEXT follows it, so the sentence still stands on
       its own: "**B** *bird sing* does not agree" -> "*bird sing* does not agree", and
       "A *map* begins /m/" -> "*map* begins /m/".

       Where the letter is the SUBJECT instead -- "B ends /im/", "A has an extra /p/ sound" --
       deleting it leaves "ends /im/", which is gibberish. Those lines are handled by
       dropUnfixableDistractors below: a sentence a child cannot parse is no better than a
       sentence that is wrong. */
    // **B** / **B.** / **B)** immediately before the restated option
    .replace(/\*\*([A-D])[).]?\*\*[ \t]*(?=[*_])/g, '')
    // list item "- B) *text*" / "- **B.** *text*"
    .replace(/^([ \t]*(?:[-*+]|\d+\.)[ \t]+)\*{0,2}[A-D][).][ \t]*\*{0,2}(?=[*_])/gm, '$1')
    // "wrong:** A *map* ..." and "; C *top* ..."
    .replace(/(\bwrong:?\*{0,2}[ \t]+)[A-D][ \t]+(?=[*_])/gi, '$1')
    .replace(/([;,][ \t]+)[A-D][ \t]+(?=[*_])/g, '$1')
    /* Parenthesised labels APPENDED to the description: "He was never confident (B) or bored
       (C) at the start". The sentence reads correctly without them, so the label goes and the
       teaching stays. Scoped to the distractor line: "(B)" elsewhere can be a genuine label
       in maths or a citation, and only 6 items in the corpus use this form at all. */
    .replace(/^[ \t]*\*{0,2}(?:Why|Distractor)[^\n]*\b(?:wrong|incorrect|note)\b[^\n]*$/gim,
      (line) => line
        // "confident (B) or bored (C)" -> the label is appended, drop it
        .replace(/[ \t]*\([A-D]\)/g, '')
        /* 'B (“Meanwhile”) is not supported' -> the option is quoted immediately after the
           letter, so the sentence keeps its subject once the letter goes. */
        .replace(/(^|\*{2}[ \t]*|[.;:,][ \t]+)[A-D][ \t]+(?=[(“‘"'])/g, '$1'));
}

/* Drop distractor analysis that is keyed to option LETTERS which practice has shuffled away.

   "**Why the other answers are wrong:** B ends /im/; C ends /unk/; D ends /īt/" cannot be
   repaired by deletion -- the letters ARE the subjects of those clauses. And it cannot be left
   alone: options are shuffled on every attempt (legacy did the same), so across 3000 trials
   the letter named was wrong 78% of the time. A child who answered incorrectly would read a
   confident, false statement about which option was which.

   So the segment goes. That loses real teaching content, and it is still the right trade:
   a missing explanation is recoverable by re-authoring, a false one teaches the wrong thing
   today. Anything whose letters were safely strippable above no longer matches here and is
   kept. */
function dropUnfixableDistractors(text) {
  const lines = String(text).split('\n');
  /* Every header variant in the corpus, counted rather than guessed:
       "why the other answers are wrong" (643), "why other answers are wrong" (309),
       "why others are wrong" (164), "why other answers are incorrect" (56),
       "why the others are wrong" (40), "distractor note" (1).
     Matching only "wrong" left 163 sections behind, all of them saying "incorrect". */
  const isHeader = (l) => /\bwhy\b[^\n]*\b(?:wrong|incorrect)\b/i.test(l)
    || /\bdistractor note\b/i.test(l);
  const isItem = (l) => /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/.test(l);
  /* A letter still acting as a LABEL or SUBJECT: bold on its own, or introducing a clause.
     By this point every letter that could be dropped safely already has been, so anything
     matching here is one the sentence depends on. */
  const UNFIXABLE = new RegExp([
    '\\*\\*[A-D][).]?\\*\\*',                      // **B** used as a label
    '(?:^[ \\t]*|[.;:,][ \\t]+)[A-D][ \\t]+[a-z]',      // "; C ends /unk/" and a section-opening "B ends..."
    '[A-D][\\u2019\\u0027]?s[ \\t]+[A-Z]',               // "A's Row C ..." -- not repairable
    '(?:^[ \\t]*|[.;:,][ \\t]+)[A-D][ \\t]*[(\\u201c\\u2018\\u0022\\u0027]', // letter + quoted option
    '^[ \\t]*(?:[-*+]|\\d+\\.)[ \\t]+\\*{0,2}[A-D][).]', // "- A. While this mentions..."
  ].join('|'), 'm');

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isHeader(lines[i])) { out.push(lines[i]); continue; }

    // Collect the whole section: the header plus the list items that belong to it.
    const section = [lines[i]];
    let j = i + 1;
    while (j < lines.length && (isItem(lines[j]) || (lines[j].trim() === '' && isItem(lines[j + 1] || '')))) {
      section.push(lines[j]);
      j++;
    }

    /* Judged as a UNIT. Deciding line by line produced lists where two items had lost their
       letter and a third had kept it -- worse than either consistent outcome, because the
       surviving letter looks authoritative. */
    const body = section
      .map((l) => l.replace(/^[ \t]*\*{0,2}(?:Why|Distractor)[^:]*:?\*{0,2}/i, ' '))
      .join('\n');
    if (!UNFIXABLE.test(body)) out.push(...section);

    i = j - 1;
  }
  return out.join('\n');
}

/* CROSS-QUESTION REFERENCES (2026-09-01, reported on the live site).

   Authored sets number their questions, so a shared passage is introduced as

       *Read the following passage and answer questions 34-37.*
       *Use the diagram below for Questions 34-37:*

   Practice serves ONE question at a time, in shuffled order. "Questions 34-37" refers to
   nothing the child can see, and the owner hit exactly that: "what is questions 34-37".

   Only the REFERENCE is removed. "Read the following passage" and "Use the diagram below"
   are instructions the child still needs, so they stay, and the sentence is closed back up.
   Both dash characters occur in the corpus -- an en dash and a hyphen -- hence [-\u2013\u2014]. */
const CROSS_QUESTION = new RegExp(
  '[ \\t]*(?:,?[ \\t]*(?:and|then)?[ \\t]*(?:answer|for|to answer))?'
  + '[ \\t]*\\bQuestions?[ \\t]+\\d+[ \\t]*(?:[-\\u2013\\u2014][ \\t]*\\d+)?',
  'gi',
);

export function stripCrossQuestionRefs(text) {
  if (text == null) return text;
  return String(text)
    .replace(CROSS_QUESTION, '')
    // Tidy what the removal leaves: " .*" -> ".*", " :*" -> ":*", doubled spaces.
    .replace(/[ \t]+([.:;,])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');
}

/* Clean an explanation for display. Order matters: the standards line is removed before the
   answer key, so an explanation that opens with both collapses cleanly rather than leaving a
   blank first line. */
export function cleanExplanation(text) {
  if (text == null) return text;
  let out = String(text);
  out = out.replace(STANDARDS_ANYWHERE, '');
  out = out.replace(ANSWER_KEY_LINE, '');
  out = out.replace(ANSWER_KEY_SENTENCE, '');
  // Strip the letters that CAN be removed safely first; whatever still carries one after that
  // is unfixable by deletion, and the line goes.
  out = stripOptionLabels(out);
  out = dropUnfixableDistractors(out);
  // Collapse the blank lines those removals leave behind, without joining real paragraphs.
  out = out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

// Pull an answer LETTER (A–D) out of a header tail or answer body, trying the
// most explicit markers first to avoid grabbing a stray "A." from prose.
export function extractAnswerLetter(text) {
  let m;
  // STAAR answer keys write `**Correct answer/value:** A. <option text>` — allow the
  // extra "/value" (or similar words) before the colon, and require the letter to be
  // followed by `.`/`)` so a griddable value like `0.45` isn't misread as a letter.
  if ((m = text.match(/Correct\s+answer[^:\n]{0,20}:\s*\**\s*([A-D])[.)]/i))) return m[1].toUpperCase();
  if ((m = text.match(/Correct answer:\s*\**\s*([A-D])\b/i))) return m[1].toUpperCase();
  if ((m = text.match(/\bAnswer:\s*\**\s*([A-D])\b/i))) return m[1].toUpperCase();
  if ((m = text.match(/^[\s—–-]*\*\*\s*([A-D])[.)]/))) return m[1].toUpperCase();
  return null;
}

// Free-response answer given as text: `**Answer: 7/20 of a pizza**`, or a STAAR key's
// `**Correct answer/value:** 0.45` (used for griddables, and occasionally for an MCQ
// whose key states the value instead of the letter — buildItem then matches it to an
// option). A bare letter is not text; extractAnswerLetter handles that case.
export function extractAnswerText(body) {
  let m;
  if ((m = body.match(/\*\*Answer:\s*(.+?)\*\*/i))) {
    const t = clean(m[1]);
    if (!/^[A-D]$/.test(t)) return t;
  }
  if ((m = body.match(/Correct\s+answer[^:\n]{0,20}:\*{0,2}\s*(.+?)\s*$/im))) {
    const t = clean(m[1]).replace(/\s*\\?$/, '');
    if (t && !/^[A-D][.)]?$/.test(t)) return t;
  }
  return null;
}

/* Remove document-footer matter from the end of an answer body.

   Cutting on headings (below) handles the appendices. What is left is the footer authors put
   at the very end of a file: a thematic break followed by whole-line italics --
   "*End of Answer Key -- 6th Grade Math MAP Growth (BOY).*",
   "*Answer key aligned with Texas STAAR test standards...*".

   Matched on STRUCTURE, not on those phrases: a trailing `---` followed only by blank lines
   and fully-italicised lines. Hand-matching the wording would break on the next file that
   words it differently, and would quietly start deleting real content if an explanation ever
   contained one of those strings. A trailing rule with nothing but italics after it is not
   part of an explanation of one question. */
export function stripDocumentFooter(body) {
  let out = String(body).trim();
  const FOOTER = /\n\s*-{3,}\s*\n(?:\s*(?:\*[^\n*][^\n]*\*|_[^\n_][^\n]*_)\s*\n?)+$/;
  out = out.replace(FOOTER, '');
  // A dangling rule left by the heading cut carries no content either.
  return out.replace(/(?:\n\s*-{3,}\s*)+$/, '').trim();
}

// number -> { number, letter|null, text|null, explanation }
export function parseAnswers(md) {
  const lines = String(md).split(/\r?\n/);
  const answers = {};
  let cur = null;

  const finish = () => {
    if (cur) {
      const body = cur.lines.join('\n');
      if (!cur.letter) cur.letter = extractAnswerLetter(cur.headTail + '\n' + body);
      if (!cur.letter && !cur.text) cur.text = extractAnswerText(body);
      answers[cur.number] = {
        number: cur.number,
        letter: cur.letter || null,
        text: cur.text || null,
        /* Same provenance strip as the question text. All 475 occurrences sit on the first
           line, which is exactly what stripStandardsAnnotation touches, and no explanation
           opens with an emphasised line that is NOT a standards annotation -- so unlike the
           question case there is nothing here it could take by mistake. */
        explanation: stripStandardsAnnotation(stripDocumentFooter(body)),
      };
    }
    cur = null;
  };

  /* Fenced code blocks are tracked so a `#` comment or a `-----` division rule inside one is
     never mistaken for document structure. Several math explanations lay out long division in
     a ``` block, and those really do contain lines that look like headings and rules. */
  let inFence = false;

  for (const line of lines) {
    let m;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (cur) cur.lines.push(line);
      continue;
    }
    if (inFence) {
      if (cur) cur.lines.push(line);
      continue;
    }
    if ((m = line.match(/^#{1,6}\s+(?:Question|Answer)\s+(\d+)\b(.*)$/i))) {
      finish();
      cur = { number: Number(m[1]), headTail: m[2] || '', letter: extractAnswerLetter(m[2] || ''), text: null, lines: [] };
      continue;
    }
    /* Any OTHER heading ends the answer body. Without this, every line after the last
       "## Answer N" was swallowed into that answer's explanation -- and the authored files end
       with document-level appendices: "## Coverage Summary", "## Quick Reference Answer Key",
       "### Scoring Rubric". The Answer Key ones are the serious case: the last question of
       several sets was shipping the correct letter for EVERY question in the set inside its own
       explanation, visible to any child who reached it.

       Cutting on headings is safe here because no individual explanation uses one. Every
       non-Question/Answer heading in doc/questionnaire is document structure: subject sections,
       answer keys, coverage summaries, rubrics. Verified across all 203 source files.

       The answer-key TABLES are still read -- the summary-table pass below scans every line of
       the document independently, so letters provided only in a key are unaffected. What
       changes is that the key stops being pasted into a child's explanation. */
    if (/^#{1,6}\s+\S/.test(line)) {
      finish();
      continue;
    }
    if (!cur) continue;
    cur.lines.push(line);
  }
  finish();

  // Some keys (esp. English) provide answers only as a summary table, which may
  // be multi-column:  | 1 | C | 11 | B | 21 | A |  — capture every Q/letter pair.
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const re = /\|\s*(\d+)\s*\|\s*([A-D])\b/gi;
    let m;
    while ((m = re.exec(line))) {
      const n = Number(m[1]);
      if (!answers[n]) {
        answers[n] = { number: n, letter: m[2].toUpperCase(), text: null, explanation: '' };
      } else if (!answers[n].letter && !answers[n].text) {
        answers[n].letter = m[2].toUpperCase();
      }
    }
  }

  return answers;
}
