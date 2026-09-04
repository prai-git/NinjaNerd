/* Legacy subtopic taxonomy + the mapping from authored headings onto it (prompt 00b).

   The old Flask app curated a fixed subtopic list and generated questions on demand, so
   nothing was ever filed against it. Our questions are authored in advance under STAAR/MAP
   headings, so a mapping layer stands between them. Both halves are guarded here: the
   taxonomy must stay faithful to obs_app.py, and the mapping must not silently misfile. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBTOPICS, subtopicsForGrade, subtopicById } from '../app/js/subtopics-data.js';
import { mapSubtopic } from '../tools/lib/subtopic-map.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECTS = ['math', 'english', 'science'];

test('taxonomy keeps the legacy shape: 5 subtopics for grades 1-5, 10 for grades 6-7', () => {
  // obs_app.py picked grades_5_and_below when `grade <= 5`, else grades_above_5.
  for (const subj of SUBJECTS) {
    // math carries two owner-approved additions at grades 1-5; the others stay at the legacy 5.
    const expectLow = subj === 'math' ? 7 : 5;
    for (const g of [1, 2, 3, 4, 5]) {
      assert.equal(subtopicsForGrade(subj, g).length, expectLow, `${subj} grade ${g}`);
    }
    // subtopicsForGrade routes on `grade <= 5`, so grade 7 already gets the extended list.
    // Asserting it here is what proves adding a grade needs no taxonomy change.
    for (const g of [6, 7]) assert.equal(subtopicsForGrade(subj, g).length, 10, `${subj} grade ${g}`);
  }
});

test('every subtopic has a name, description, icon and colour', () => {
  // The owner asked specifically for icons; a bucket without one renders as a blank card.
  for (const subj of SUBJECTS) {
    for (const s of [...subtopicsForGrade(subj, 3), ...subtopicsForGrade(subj, 6)]) {
      assert.ok(s.id && /^[a-z0-9_]+$/.test(s.id), `${subj}: bad id ${s.id}`);
      assert.ok(s.name && s.name.length > 2, `${s.id}: missing name`);
      assert.ok(s.description && s.description.length > 10, `${s.id}: missing description`);
      assert.match(s.icon, /^fa-[a-z0-9-]+$/, `${s.id}: icon must be a FontAwesome class`);
      assert.match(s.color, /^(primary|secondary|success|info|warning|danger|dark)$/,
        `${s.id}: colour must come from the legacy Bootstrap palette`);
    }
  }
});

test('grade 6 keeps the five base subtopics and adds five advanced ones', () => {
  for (const subj of SUBJECTS) {
    const low = subtopicsForGrade(subj, 5).map((s) => s.id);
    const high = subtopicsForGrade(subj, 6).map((s) => s.id);
    // Legacy grades_above_5 is the base list plus five; math's extras are ours, not legacy.
    const legacyBase = low.filter((id) => !['financial_literacy'].includes(id));
    for (const id of legacyBase) {
      if (subj === 'math' && id === 'algebraic_concepts') continue; // already legacy at grade 6
      assert.ok(high.includes(id), `${subj}: grade 6 should still offer ${id}`);
    }
  }
});

test('regex rules contain no escaped-backslash corruption', () => {
  /* A botched bulk edit once wrote `\\b` into the rules. In a JS regex that matches a literal
     backslash, not a word boundary, so those rules could never fire and their content fell
     through to the catch-all — silently, with every test still green. Guard the file itself. */
  const src = readFileSync(join(repoRoot, 'tools/lib/subtopic-map.mjs'), 'utf8');
  assert.doesNotMatch(src, /\\\\b/, 'found `\\\\b` — should be `\\b`');
});

test('"Operations" is not captured by the percentages rule', () => {
  /* The real bug this guards: /ratio/ matched the middle of "Ope-ratio-ns", so every heading
     containing "Operations" was filed under Fractions & Decimals. Unanchored short tokens
     hiding inside longer words are the failure mode for this whole rule set. */
  for (const [heading, expected] of [
    ['Number Operations', 'number_sense_basic_operations'],
    ['Number & Operations', 'number_sense_basic_operations'],
    ['Order of Operations', 'number_sense_basic_operations'],
    ['Operations & Algebraic Thinking', 'algebraic_concepts'],
    ['Number Operations — Multiplication and Division', 'number_sense_basic_operations'],
  ]) {
    assert.equal(mapSubtopic('math', 5, heading).id, expected, heading);
  }
  // ...while genuine fraction/decimal/percent headings still land correctly.
  for (const [heading, expected] of [
    ['Decimal Operations', 'fractions_decimals'],
    ['Number Operations — Fractions', 'fractions_decimals'],
    ['Percentages (Extra Coverage)', 'fractions_decimals'],
  ]) {
    assert.equal(mapSubtopic('math', 5, heading).id, expected, heading);
  }
});

test('science headings reach their own buckets, not the catch-all', () => {
  // These were the rules corrupted by the `\\b` bug; "Earth & Space Science" fell through to
  // scientific_investigation_skills, which is how the corruption was noticed.
  for (const [heading, expected] of [
    ['Earth & Space Science', 'earth_systems'],
    ['Forces, Motion, and Energy', 'forces_energy'],
    ['Waves, Magnetism, and Electricity', 'forces_energy'],
    ['Chemistry & Physics — Matter and Its Properties', 'physical_science_basics'],
    ['Life Science', 'life_science_fundamentals'],
  ]) {
    assert.equal(mapSubtopic('science', 3, heading).id, expected, heading);
  }
  assert.equal(mapSubtopic('science', 6, 'Earth & Space Science').id, 'earth_space_science',
    'grade 6 routes to the advanced bucket');
});

test('every subtopic in the manifest is a real taxonomy id for that grade', () => {
  /* The build files items by legacy subtopic id, so the manifest holds ids, not authored
     headings. An id the taxonomy does not offer at that grade would render nothing — the
     page builds its cards from the taxonomy and looks counts up by id. */
  const man = JSON.parse(
    readFileSync(join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  for (const [g, subs] of Object.entries(man.grades)) {
    for (const [subj, items] of Object.entries(subs)) {
      for (const it of items) {
        assert.ok(subtopicById(subj, +g, it.subtopic),
          `g${g} ${subj}: manifest id "${it.subtopic}" is not offered at that grade`);
      }
    }
  }
});

test('each item records the heading it was authored under, and it still maps there', () => {
  /* sourceSubtopic is the provenance that makes a remap cheap: change the rules, rebuild,
     and nothing about the authored files moves. This also re-runs the mapping over every
     real heading, which is what catches a rule regression like the "Ope-ratio-ns" bug. */
  const man = JSON.parse(
    readFileSync(join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  const unmapped = [];
  let checked = 0;
  for (const [g, subs] of Object.entries(man.grades)) {
    for (const [subj, entries] of Object.entries(subs)) {
      for (const e of entries) {
        const items = JSON.parse(readFileSync(
          join(repoRoot, `app/content/questions/en/${g}/${subj}/${e.slug}.json`), 'utf8'));
        for (const it of items) {
          assert.ok(it.sourceSubtopic, `${it.id}: missing sourceSubtopic`);
          const r = mapSubtopic(subj, +g, it.sourceSubtopic);
          assert.equal(r.id, it.subtopic,
            `${it.id}: "${it.sourceSubtopic}" maps to ${r.id} but is filed under ${it.subtopic}`);
          if (r.unmapped) unmapped.push(`g${g} ${subj}: ${it.sourceSubtopic}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 1000, `expected the whole corpus, only checked ${checked}`);
  /* English headings are passage TITLES ("The Old Kite"), which carry no skill keyword by
     definition, so falling through is correct there and is reported separately. For math and
     science a fall-through means a missing rule. */
  assert.deepEqual([...new Set(unmapped)], [],
    `math/science headings with no rule:\n${[...new Set(unmapped)].join('\n')}`);
});

test('the two owner-approved math additions are sourced, not invented', () => {
  const alg = subtopicById('math', 3, 'algebraic_concepts');
  const legacyAlg = SUBTOPICS.math.grades_above_5.find((s) => s.id === 'algebraic_concepts');
  assert.deepEqual(alg, legacyAlg, 'algebraic_concepts must be the legacy grade-6 entry verbatim');

  const fin = subtopicById('math', 3, 'financial_literacy');
  assert.equal(fin.icon, 'fa-dollar-sign',
    'icon comes from the legacy history subtopic economic_systems_financial_literacy');
  assert.ok(!subtopicsForGrade('math', 5).some((s) => s.id !== 'financial_literacy' && s.color === fin.color),
    'its colour must not collide with another grades-1-5 math subtopic');
});

/* RELEASE GATE — see doc/prompt/16_author_missing_content_prompt.md.

   This was `todo` while 44 subtopics stood empty; a permanently red suite stops meaning
   anything. All 115 now have questions, so the flag is off and an empty subtopic is a build
   failure from here on. The site must never ship a dead card in front of a child. */
test('no subtopic is empty at any grade', () => {
  const man = JSON.parse(
    readFileSync(join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  const empty = [];
  for (const subj of SUBJECTS) {
    for (const g of [1, 2, 3, 4, 5, 6, 7]) {
      const counts = {};
      for (const e of (man.grades?.[String(g)]?.[subj] || [])) counts[e.subtopic] = e.count || 0;
      for (const s of subtopicsForGrade(subj, g)) {
        if (!counts[s.id]) empty.push(`g${g} ${subj}: ${s.name}`);
      }
    }
  }
  assert.deepEqual(empty, [], `${empty.length} subtopics have no questions:\n${empty.join('\n')}`);
});

/* RELEASE GATE — minimum questions per subtopic. ONE number, every grade.

   Owner decisions in order: 20 at launch (2026-09-01), then 50 after seeing subtopics with 3
   and 4 questions live, then 50 for grade 6 / 30 for grades 1-5, and finally **25 uniform**
   (2026-09-03) once the earlier numbers were measured against the app rather than estimated.

   Why 25, and why the split went away.

   `practice.js` calls `buildAttempt(pool)` with NO cap, so a session serves the ENTIRE
   remaining bucket and the counter literally reads "Question 1 of N". Bucket size and quiz
   length are therefore the same number today. A 50 floor was not a target — it was a promise
   to put "Question 1 of 50" in front of a nine-year-old in every bucket, and it would have
   required authoring 3,983 more questions, more than the whole corpus then existing.

   25 is where the corpus already sits: median bucket 25, and the 20-29 band holds 41% of all
   145 buckets. It codifies the content rather than inventing a target, and leaves a reachable
   gap (781) instead of an unreachable one — which matters, because a permanently red gate
   stops carrying signal.

   The old 30/50 split argued that grade 6 carries two tracks (on-level 6.x alongside
   accelerated 7.x/8.x maths and Honors ELAR) and so needs twice the depth. That argues for
   VARIETY, not COUNT, and the too-long-quiz problem is no better at grade 6 than grade 3. One
   number for every grade.

   THIS IS A FLOOR, NOT A TARGET — owner, 2026-09-03: "this is lower limit so if there are
   buckets which have more than 25 then it is fine." Nothing here caps a bucket, and richer
   buckets are strictly better: a question answered correctly is retired until the whole
   subtopic has been worked through, so more questions means a longer run of fresh ones.

   Why a minimum exists at all, beyond "more is better": practice retires a question once the
   child answers it correctly, and serves the subtopic again only when the whole list has been
   worked through (see test_data.test.js). With a 10-question bucket a child exhausts a
   subtopic in one sitting and immediately meets the "starting again" banner.

   This was `todo` while the authoring caught up. Since 2026-09-04 **all 145 buckets meet the
   floor**, so the flag is gone and a regression fails the build, exactly as the "no subtopic is
   empty" gate does. The assertion message still lists every short bucket with its count and its
   target, which is what makes a failure actionable rather than merely red. */
const MIN_QUESTIONS = 25;
const minFor = () => MIN_QUESTIONS;

test('every subtopic meets its grade\'s question minimum', () => {
  const man = JSON.parse(
    readFileSync(join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  const short = [];
  for (const subj of SUBJECTS) {
    for (const g of [1, 2, 3, 4, 5, 6, 7]) {
      const counts = {};
      for (const e of (man.grades?.[String(g)]?.[subj] || [])) counts[e.subtopic] = e.count || 0;
      for (const s of subtopicsForGrade(subj, g)) {
        const n = counts[s.id] || 0;
        const min = minFor(g);
        if (n < min) short.push(`g${g} ${subj}: ${s.name} (${n}/${min})`);
      }
    }
  }
  assert.deepEqual(short, [], `${short.length} subtopics are short:\n${short.join('\n')}`);
});

test('the floor is the one the owner set: 25, the same at every grade', () => {
  assert.equal(MIN_QUESTIONS, 25, 'owner set 25 uniform on 2026-09-03');
  // One number really is applied everywhere — the old 30/50 split is gone, not just unused.
  for (const g of [1, 2, 3, 4, 5, 6, 7]) assert.equal(minFor(g), 25, `grade ${g} floor`);
});

/* The floor is a LOWER limit. A bucket above it is not a defect, and nothing in the suite may
   start treating it as one — the owner said so explicitly, and richer buckets are better:
   more questions means a longer run before the "starting again" banner. */
test('a bucket above the floor is fine — nothing caps it', () => {
  const man = JSON.parse(
    readFileSync(join(repoRoot, 'app/content/questions/en/manifest.json'), 'utf8'));
  let over = 0;
  for (const subj of SUBJECTS) {
    for (const g of [1, 2, 3, 4, 5, 6, 7]) {
      for (const e of (man.grades?.[String(g)]?.[subj] || [])) {
        if ((e.count || 0) > MIN_QUESTIONS) over += 1;
      }
    }
  }
  assert.ok(over > 0, 'buckets already exceed the floor, which is expected and allowed');
});
