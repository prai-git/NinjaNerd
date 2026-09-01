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

export function parseQuestions(md) {
  const lines = String(md).split(/\r?\n/);
  const questions = [];
  // Falls back to the document title; a structural heading must not overwrite it.
  let subtopic = subtopicFromTitle(md);
  let cur = null;
  let skipping = false;

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
    if ((m = line.match(/^#\s+Instructional Area:\s*(.+)$/i))) { pushCur(); subtopic = cleanSubtopic(m[1]); continue; }
    // Any H2 that is not a question/answer header is treated as a subtopic.
    if ((m = line.match(/^##\s+(.+)$/)) && !/^Question\s+\d+/i.test(m[1]) && !/^Answer(\s|$)/i.test(m[1])) {
      pushCur();
      // "## Questions", "## Concept Review" etc. structure the page; they do not name a topic.
      if (!isStructuralHeading(m[1])) subtopic = cleanSubtopic(m[1]);
      continue;
    }

    if ((m = line.match(/^#{2,3}\s+Question\s+(\d+)\b(.*)$/i)) ||
        (m = line.match(/^\*\*Question\s+(\d+)\*\*\s*(.*)$/i))) {
      pushCur();
      const tail = m[2] || '';
      const teks = tail.match(/TEKS\s+[^)*\]]+/i);
      cur = { number: Number(m[1]), subtopic, teks: teks ? clean(teks[0]) : null, textLines: [], options: [] };
      const rest = tail
        .replace(/\[(?:BOY|MOY|EOY)\]/gi, '')
        .replace(/\*?\(([^)]*)\)\*?/g, '')
        .trim();
      if (rest) cur.textLines.push(rest);
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
