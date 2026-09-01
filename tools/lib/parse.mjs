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
    if (prose.length >= PASSAGE_MIN_CHARS) {
      passage = prose;
      passageTitle = pendingHeading;
      passageLevel = pendingLevel;
      passagesByKey.set(passageKey(pendingHeading), { text: prose, title: pendingHeading });
    } else if (passage !== null && pendingLevel <= passageLevel) {
      passage = null;
      passageTitle = null;
    }
    pendingHeading = null;
    pendingProse = [];
  };

  const pushCur = () => {
    if (cur) {
      cur.text = cur.textLines.join('\n').trim();
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
      if (INLINE_INSTRUCTION_HEADING.test(m[1])) continue;
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
        const hit = ref && passagesByKey.get(passageKey(ref[1]));
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
        explanation: body.trim(),
      };
    }
    cur = null;
  };

  for (const line of lines) {
    let m;
    if ((m = line.match(/^#{2,4}\s+(?:Question|Answer)\s+(\d+)\b(.*)$/i))) {
      finish();
      cur = { number: Number(m[1]), headTail: m[2] || '', letter: extractAnswerLetter(m[2] || ''), text: null, lines: [] };
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
