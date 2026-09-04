/* Block-level rendering of authored content (tables, fenced code) and the parser fix that
   stopped document appendices leaking into explanations.

   Both defects reached children on the live site:
     - a data table a child must READ to answer rendered as a wall of pipes and dashes;
     - the last question of several sets carried the ANSWER KEY FOR THE WHOLE SET in its
       explanation. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBlocks, renderInline } from '../app/js/flow.js';
import {
  parseAnswers, stripDocumentFooter, stripStandardsAnnotation,
} from '../tools/lib/parse.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(repoRoot, 'app/content/questions/en');

function everyItem(fn) {
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json') && f !== 'manifest.json') {
        for (const it of JSON.parse(readFileSync(p, 'utf8'))) fn(it, p);
      }
    }
  };
  walk(CONTENT);
}

// ---- tables --------------------------------------------------------------------------------

test('a GFM table becomes a real table, with its alignment', () => {
  // The exact question the owner reported, from grade 5 science.
  const html = renderBlocks([
    'Three equal-sized cubes are tested in a tub of water.',
    '',
    '| Cube | Mass | Result in water |',
    '|---|---:|---|',
    '| A | 18 g | floats |',
    '| B | 42 g | sinks |',
    '',
    'Which pattern is supported?',
  ].join('\n'));

  assert.match(html, /<table[^>]*>/);
  assert.match(html, /<thead[^>]*><tr><th>Cube<\/th>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3, 'header + two body rows');
  assert.match(html, /<td>floats<\/td>/);
  // Text either side of the table survives.
  assert.match(html, /Three equal-sized cubes/);
  assert.match(html, /Which pattern is supported\?/);
  // And no raw pipes are left anywhere.
  assert.doesNotMatch(html, /\|/, 'a stray pipe means part of the table was not parsed');
});

test('alignment uses Bootstrap 5 names, not Bootstrap 4', () => {
  /* `text-right`/`text-left` are Bootstrap 4 and were dropped in 5; the site loads 5.3.3.
     Getting it wrong fails SILENTLY — the class is emitted, matches no rule, and every number
     in a right-aligned column quietly stays left. */
  const html = renderBlocks('| a | b | c |\n|:---|---:|:---:|\n| 1 | 2 | 3 |');
  assert.match(html, /class="text-start"/);
  assert.match(html, /class="text-end"/);
  assert.match(html, /class="text-center"/);
  assert.doesNotMatch(html, /text-right|text-left/, 'Bootstrap 4 class names do nothing here');
});

test('a wide table scrolls in its own box rather than stretching the page', () => {
  const html = renderBlocks('| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(html, /class="table-responsive/);
  assert.match(html, /class="table table-sm/);
});

/* The safeguard that makes this usable on content full of maths. Six options contain absolute
   value — \(|-8| > |5|\) — and a sentence may contain a pipe for any reason. Requiring a
   DELIMITER row is what keeps those out of a table. */
test('pipes that are not a table are left alone', () => {
  for (const s of [
    'The submarine is farther because \\(|-240| > |180|\\).',
    '\\(|-8| > |5|\\)',
    'Compare | this | and | that | inline.',
    '| a | b |', // a pipe row with no delimiter row under it is not a table
  ]) {
    assert.doesNotMatch(renderBlocks(s), /<table/, `wrongly treated as a table: ${s}`);
  }
});

test('options are rendered inline, never as blocks', () => {
  /* Options are single-line by construction and the only pipes they carry are absolute value.
     Running them through the block renderer is what would turn maths into a table. */
  const src = readFileSync(join(repoRoot, 'app/js/practice.js'), 'utf8');
  assert.match(src, /label\.innerHTML = renderInline\(option\)/);
  const learn = readFileSync(join(repoRoot, 'app/js/learn.js'), 'utf8');
  assert.match(learn, /\$\{renderInline\(opt\)\}/);
});

test('a table is not put inside a heading element', () => {
  // <h5> cannot legally contain a <table>; browsers recover unpredictably.
  const src = readFileSync(join(repoRoot, 'app/js/practice.js'), 'utf8');
  assert.doesNotMatch(src, /<h5>\$\{renderBlocks/, 'block content must not go in an <h5>');
  assert.match(src, /<div class="h5">\$\{renderBlocks\(item\.question\)\}<\/div>/);
});

// ---- fenced code ---------------------------------------------------------------------------

test('fenced code keeps its alignment', () => {
  /* 19 explanations lay out long division inside a fence. Collapsing that to <br>-separated
     proportional text destroys the column alignment that IS the explanation. */
  const html = renderBlocks('Work it out:\n```\n  620\n+ 37200\n-------\n 40300\n```\ndone');
  assert.match(html, /<pre[^>]*><code>/);
  assert.match(html, /\+ 37200\n-{7}/, 'the fence contents must be preserved verbatim');
  assert.doesNotMatch(html.slice(html.indexOf('<pre'), html.indexOf('</pre>')), /<br>/);
});

test('markup inside a fence is escaped, not executed', () => {
  const html = renderBlocks('```\n<script>alert(1)</script>\n```');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('content with no block construct renders exactly as before', () => {
  // The change must be additive: a plain string must not shift by a single character.
  for (const s of ['Simple text', '**bold** and *italic*', 'line one\nline two', '`code`']) {
    assert.equal(renderBlocks(s), renderInline(s), `output changed for: ${s}`);
  }
});

test('cell text is escaped and still gets inline formatting', () => {
  const html = renderBlocks('| a | b |\n|---|---|\n| <b>x</b> | **bold** |');
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/, 'HTML in a cell must be escaped');
  assert.match(html, /<strong>bold<\/strong>/, 'but markdown emphasis still renders');
});

// ---- the parser fix: document appendices must not reach children --------------------------

test('a trailing appendix does not become part of the last explanation', () => {
  const md = [
    '## Answer 1',
    '**Correct answer:** B.',
    '**Explanation:** Because.',
    '',
    '## Quick Reference Answer Key',
    '',
    '| Q | Ans |',
    '|---|-----|',
    '| 1 | B |',
    '| 2 | A |',
  ].join('\n');
  const answers = parseAnswers(md);
  assert.match(answers[1].explanation, /Because\./);
  assert.doesNotMatch(answers[1].explanation, /Quick Reference/,
    'the appendix heading leaked into the explanation');
  assert.doesNotMatch(answers[1].explanation, /\| 2 \| A \|/,
    'the answer key leaked into the explanation — a child would see every answer');

  // The key is still READ for letters; it is only kept out of the explanation text.
  assert.equal(answers[2].letter, 'A', 'letters provided only in a summary table still parse');
});

test('a heading inside a code fence does not truncate an explanation', () => {
  /* Several math explanations lay out arithmetic in a fence, and those blocks really do
     contain lines starting with # or -----. Cutting on them would silently drop the rest of a
     child's explanation. */
  const md = [
    '## Answer 1',
    'Start.',
    '```',
    '# not a heading',
    '-------',
    '```',
    'End.',
  ].join('\n');
  const ex = parseAnswers(md)[1].explanation;
  assert.match(ex, /Start\./);
  assert.match(ex, /End\./, 'content after the fence was lost');
  assert.match(ex, /# not a heading/, 'the fence contents must survive');
});

test('the document footer is stripped by structure, not by matching its wording', () => {
  /* Hand-matching "*End of Answer Key*" would break on the next file that words it
     differently, and would start deleting real content if an explanation ever contained the
     phrase. The rule is: a trailing rule followed only by whole-line italics. */
  const kept = 'Real explanation.\n\n---\n\n*End of Answer Key — 6th Grade Math.*';
  assert.equal(stripDocumentFooter(kept), 'Real explanation.');

  // Italics that are part of the explanation, with no preceding rule, stay.
  const body = 'The word *because* signals a cause.';
  assert.equal(stripDocumentFooter(body), body);
});

// ---- the whole corpus ----------------------------------------------------------------------

test('no shipped item carries document matter or an answer key', () => {
  const bad = [];
  everyItem((it, p) => {
    const ex = it.explanation || '';
    // Headings outside a fence are document structure, never part of one explanation.
    let fence = false;
    for (const line of ex.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
      if (!fence && /^#{1,6}\s+\S/.test(line)) bad.push(`${p} ${it.id}: heading "${line.trim()}"`);
    }
    if (/answer key/i.test(ex)) bad.push(`${p} ${it.id}: mentions an answer key`);
  });
  assert.deepEqual(bad, [], `${bad.length} items carry document matter:\n${bad.slice(0, 10).join('\n')}`);
});

test('every table in the corpus renders as a table, with no rows left as text', () => {
  /* The real regression guard: render every table in the shipped corpus and fail if any table
     ROW survives as text, which is exactly what the owner saw.

     "A pipe remains" would be the wrong test. Pipes are legitimate in three places and none of
     them is a defect:
       - inline maths, where they are absolute-value bars: \(|-8| > |5|\);
       - inside a <pre>, where one grade-5 geometry question draws its figure in ASCII art;
       - as a separator inside a line of prose ("TEKS 5.9 | Topic: Eclipses").
     What must never survive is a LINE that begins with a pipe — that is an unrendered row. */
  let checked = 0;
  const broken = [];

  // A GFM delimiter row needs at least one dash. `|        |` (ASCII art) has none, and
  // fenced regions are excluded entirely.
  const outsideFences = (src) => {
    let fence = false;
    return src.split('\n').filter((l) => {
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return false; }
      return !fence;
    });
  };

  everyItem((it, p) => {
    for (const field of ['question', 'passage', 'explanation']) {
      const src = it[field];
      if (!src) continue;
      const lines = outsideFences(src);
      const hasTable = lines.some((l) => /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(l));
      if (!hasTable) continue;
      checked++;

      const html = renderBlocks(src);
      if (!/<table/.test(html)) {
        broken.push(`${p} ${it.id} (${field}): table not detected`);
        continue;
      }
      // Strip the parts where a pipe is legitimate, then look for a row left as text.
      const rest = html
        .replace(/<table[\s\S]*?<\/table>/g, '')
        .replace(/<pre[\s\S]*?<\/pre>/g, '')
        .replace(/\\\((?:[^\\]|\\(?!\)))*\\\)/g, '');
      if (/(?:^|<br>)\s*\|/.test(rest)) {
        broken.push(`${p} ${it.id} (${field}): a table row is still rendered as text`);
      }
    }
  });

  assert.ok(checked >= 90, `expected the corpus tables, only checked ${checked}`);
  assert.deepEqual(broken, [],
    `${broken.length} tables still broken:\n${broken.slice(0, 10).join('\n')}`);
});

// ---- authoring provenance must not reach children -----------------------------------------

test('no explanation opens with a curriculum-standard annotation either', () => {
  /* Owner decision, 2026-09-01: strip these from explanations as well as questions. All 475
     occurrences sat on the first line, and no explanation opened with an emphasised line that
     was NOT a standards annotation, so unlike the question case there was nothing here the
     rule could take by mistake. */
  const bad = [];
  everyItem((it, p) => {
    const first = (it.explanation || '').split('\n')[0].trim();
    if (/^\*{1,2}[^*\n]*\b(TEKS|MAP|NWEA|STAAR|Readiness|Instructional Area)\b[^*\n]*\*{1,2}$/
      .test(first)) {
      bad.push(`${p} ${it.id}: ${first}`);
    }
  });
  assert.deepEqual(bad, [],
    `${bad.length} explanations still show provenance:\n${bad.slice(0, 5).join('\n')}`);
});

test('stripping provenance did not empty any explanation', () => {
  /* The strip removes a leading line. If an explanation consisted ONLY of that line, it would
     silently become blank and the child would get no explanation at all. 200 items have no
     explanation, but that count was identical before this change -- they come from sets whose
     answers were given only as a summary key table, which is a separate content gap. */
  let empty = 0;
  everyItem((it) => { if (!(it.explanation || '').trim()) empty++; });
  assert.equal(empty, 200,
    `expected the 200 pre-existing empty explanations, found ${empty} — the strip took content`);
});

test('an explanation that is only an annotation is not silently blanked', () => {
  // The failure mode the count above guards against, pinned directly on the function.
  assert.equal(stripStandardsAnnotation('**TEKS 5.9 | Topic: Eclipses**\n\nEarth blocks it.'),
    'Earth blocks it.');
  // Nothing but the annotation -> genuinely empty, and both views already render no card.
  assert.equal(stripStandardsAnnotation('**TEKS 5.9 | Topic: Eclipses**'), '');
  const practice = readFileSync(join(repoRoot, 'app/js/practice.js'), 'utf8');
  assert.match(practice, /if \(item\.explanation\) \{/,
    'practice must not render an empty Explanation card');
  const learn = readFileSync(join(repoRoot, 'app/js/learn.js'), 'utf8');
  assert.match(learn, /\$\{it\.explanation \? `/,
    'learn must not render an empty Explanation card');
});

test('no question opens with a curriculum-standard annotation', () => {
  /* 222 questions began with authoring provenance shown as the first line a child reads:
       *MAP Instructional Area: Earth & Space Science | TEKS 2.10B,2.1F*
       **TEKS 3.6H [R] — inference**
     Found because the pipe in the first form looked like stray table syntax. */
  const bad = [];
  everyItem((it, p) => {
    const first = (it.question || '').split('\n')[0].trim();
    if (/^\*{1,2}[^*]*\b(TEKS|MAP Instructional|NWEA|Readiness)\b[^*]*\*{1,2}$/i.test(first)) {
      bad.push(`${p} ${it.id}: ${first}`);
    }
  });
  assert.deepEqual(bad, [],
    `${bad.length} questions still show authoring provenance:\n${bad.slice(0, 5).join('\n')}`);
});

test('stripping provenance does not eat real content', () => {
  /* The reason the rule requires a NAMED standard rather than just "wholly emphasised". Across
     the corpus the emphasised opening lines that are NOT provenance are a line of poetry the
     question asks about, a document title, and difficulty labels. Losing any of them would
     make the question unanswerable or change its meaning. */
  let poem = 0;
  let notice = 0;
  let label = 0;
  everyItem((it) => {
    const first = (it.question || '').split('\n')[0].trim();
    if (/purple coat/.test(first)) poem++;
    if (/Notice 1: Window Feeder/.test(first)) notice++;
    if (/\[stretch\]|Honors research item/.test(first)) label++;
  });
  assert.ok(poem > 0, 'the poetry opening line was stripped — the question asks about it');
  assert.ok(notice > 0, 'the "Notice 1" document title was stripped');
  assert.ok(label > 0, 'the difficulty labels were stripped');
});

test('stripStandardsAnnotation is keyword-gated, not emphasis-gated', () => {
  assert.equal(stripStandardsAnnotation('*TEKS 2.9A*\nWhat floats?'), 'What floats?');
  assert.equal(stripStandardsAnnotation('**TEKS 3.6H [R] — inference**\nWhy?'), 'Why?');
  // No standard named: left completely alone.
  const poem = '*The pond wears a purple coat,*\nWhat does this describe?';
  assert.equal(stripStandardsAnnotation(poem), poem);
  const title = '**Notice 1: Window Feeder**\nWho may use it?';
  assert.equal(stripStandardsAnnotation(title), title);
  // Only the FIRST line, never one buried mid-question.
  const mid = 'Read it.\n*TEKS 2.9A*\nWhat next?';
  assert.equal(stripStandardsAnnotation(mid), mid);
});

/* ---- Defects found on the LIVE site, 2026-09-01 ------------------------------------------ */

test('a markdown blockquote renders as a quote, not a literal ">"', () => {
  /* Authors set the sentence a question is ABOUT as a quote. The child was shown "&gt;" in
     front of the very text they had to read. */
  const out = renderBlocks('Read the sentence below.\n\n> The hikers were **fatigued**.\n\nWhat does it mean?');
  assert.match(out, /<blockquote/);
  assert.match(out, /<strong>fatigued<\/strong>/, 'inline markup still applies inside a quote');
  assert.doesNotMatch(out, /&gt;\s*The hikers/, 'the marker itself must not be shown');
});

test('consecutive quote lines form ONE blockquote', () => {
  const out = renderBlocks('> line one\n> line two');
  assert.equal((out.match(/<blockquote/g) || []).length, 1);
  assert.match(out, /line one<br>line two/);
});

test('a greater-than sign inside prose is not a blockquote', () => {
  // Maths explanations say things like "5 > 3"; only a line-leading ">" is a quote.
  const out = renderBlocks('If 5 > 3 then the statement is true.');
  assert.doesNotMatch(out, /<blockquote/);
  assert.match(out, /5 &gt; 3/);
});

test('an escaped underscore renders as an underscore', () => {
  // Fill-in-the-blank: the child was shown "generous is to \_\_\_\_".
  assert.equal(renderInline('generous is to \\_\\_\\_\\_'), 'generous is to ____');
});

test('unescaping NEVER touches maths — it would break 303 items to fix 4', () => {
  /* Nearly every backslash in this corpus is LaTeX: \( and \) appear 1313 times each as the
     inline-maths delimiters KaTeX looks for. A general markdown unescape turned
     "0.25 x \(80 = \)20" into "0.25 x (80 = )20". Only \_ is unescaped, and not inside maths. */
  assert.equal(renderInline('0.25 x \\(80 = \\)20'), '0.25 x \\(80 = \\)20');
  assert.equal(renderInline('\\(x\\_1 + y\\)'), '\\(x\\_1 + y\\)',
    'a subscript inside maths is LaTeX and must survive');
  assert.equal(renderInline('\\frac{1}{2} and \\times'), '\\frac{1}{2} and \\times');
});

test('emphasis still works alongside the escape handling', () => {
  assert.equal(renderInline('**bold** and *em*'), '<strong>bold</strong> and <em>em</em>');
});

/* ---- CORPUS-WIDE RENDER AUDIT (2026-09-04) ------------------------------------------------

   Added after a maths/currency audit found 236 items rendering wrongly on the live site, none
   of which any unit test could have caught: they needed the REAL renderers run over the REAL
   authored text. `throwOnError: false` in math-render.js is why the class ships silently — a
   KaTeX parse error prints the source in red instead of crashing.

   These run the shipped renderers over every item, so a regression fails the build. */

test('every shipped maths span is inside the LaTeX subset KaTeX supports', () => {
  /* Verified by enumeration rather than by installing KaTeX: the corpus uses exactly 33
     distinct commands and every one is KaTeX-supported. Anything new has to be added here
     deliberately, which is the point — an unsupported command renders as red source text. */
  const OK = new Set(['times', 'div', 'frac', 'dfrac', 'tfrac', 'text', 'cdot', 'sqrt', 'le',
    'leq', 'ge', 'geq', 'ne', 'neq', 'pm', 'approx', 'circ', 'Box', 'pi', 'quad', 'qquad',
    'left', 'right', 'mathbf', 'ldots', 'to', 'rightarrow', 'Rightarrow', 'overline',
    '$', '%', '&', '#', '_', '{', '}', '!', ' ', ',', ';', ':']);
  const bad = new Map();
  everyItem((it) => {
    for (const f of [it.question, it.explanation, it.passage, ...(it.options || [])]) {
      const t = String(f || '');
      for (const m of t.matchAll(/\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$/g)) {
        const span = m[1] !== undefined ? m[1] : m[2];
        for (const c of span.match(/\\([A-Za-z]+|.)/g) || []) {
          const name = c.slice(1);
          if (!OK.has(name)) bad.set(c, it.id);
        }
        // A bare $ is a parse error; a bare % comments out the rest of the span.
        assert.ok(!/(^|[^\\])\$/.test(span), `${it.id}: bare $ inside maths: ${span}`);
        assert.ok(!/(^|[^\\])%/.test(span), `${it.id}: bare % inside maths: ${span}`);
      }
      // A command outside a span renders as raw source, not as maths.
      const outside = t.replace(/\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g, ' ');
      assert.ok(!/\\(times|frac|text|div|cdot|sqrt|Box)\b/.test(outside),
        `${it.id}: LaTeX command outside a maths span`);
      // A literal tab or form feed means \t or \f was eaten when the source was written.
      assert.ok(!/[\t\x08\x0b\x0c\r]/.test(t), `${it.id}: control character in content`);
    }
  });
  assert.deepEqual([...bad.keys()], [], `unsupported KaTeX commands: ${[...bad].join(', ')}`);
});

test('no authoring apparatus reaches a child', () => {
  /* All four of these shipped. The first two came from the tail of a `## Question N` heading,
     which parse.mjs used to push into the stem: 66 items opened with "— Multi-Step Equation
     with Unknown [R]" and 48 carried a bare "[R]". */
  everyItem((it) => {
    const stem = String(it.question || '');
    const all = [it.question, it.explanation, it.passage, ...(it.options || [])].join('\n');
    assert.ok(!/^\s*[–—-]\s*[A-Z]/.test(stem), `${it.id}: stem opens with a section label`);
    assert.ok(!/\[R\]/.test(all), `${it.id}: [R] authoring marker`);
    assert.ok(!/^\s*\*{1,2}[^*\n]*\b(?:TEKS|MAP|NWEA|Readiness)\b[^*\n]*:\s*\*{1,2}/i.test(stem),
      `${it.id}: standards label on the stem`);
    assert.ok(!/^\s*(?:Question|Answer)\s+\d+\s*$/m.test(all), `${it.id}: Question/Answer heading`);
  });
});

test('the real renderers produce no broken output for any item', () => {
  everyItem((it) => {
    for (const [name, raw] of [['question', it.question], ['explanation', it.explanation],
      ['passage', it.passage], ...(it.options || []).map((o, i) => [`option${i}`, o])]) {
      const t = String(raw || '');
      if (!t) continue;
      const html = name.startsWith('option') ? renderInline(t) : renderBlocks(t);
      // Unclosed emphasis leaves literal asterisks in front of the child.
      assert.ok(!html.includes('**'), `${it.id} ${name}: unclosed bold`);
      // Bootstrap 5 dropped text-left/text-right and fails silently.
      assert.ok(!/text-(left|right)\b/.test(html), `${it.id} ${name}: Bootstrap 4 alignment class`);
      // A question renders inside div.h5, so a heading element would be illegal nesting.
      assert.ok(!/<h[1-6]\b/.test(html), `${it.id} ${name}: heading element in content`);
      // A pipe table that did not become a <table> renders as a wall of pipes. Fenced code
      // holds ASCII diagrams whose lines are also pipe-delimited, so exclude those first.
      const unfenced = t.replace(/```[\s\S]*?```/g, '');
      const rows = unfenced.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l)).length;
      if (rows >= 2) assert.ok(/<table/.test(html), `${it.id} ${name}: table did not render`);
    }
  });
});
