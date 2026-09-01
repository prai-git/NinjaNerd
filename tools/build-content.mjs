/* Dev-time content build (prompt 03): authored .md -> normalized MCQ JSON.
   Reads pairs from doc/questionnaire/, converts, and writes
   app/content/questions/en/<grade>/<subject>/<subtopic>.json plus a review report.
   NEVER runs at runtime — this is a build step (`npm run build:content`). */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseFilename, parseGrade, parseQuestions, parseAnswers, slug,
} from './lib/parse.mjs';
import { buildItem, splitMultiPart } from './lib/mcq.mjs';
import { mapSubtopic } from './lib/subtopic-map.mjs';
import { createLLM } from './lib/llm.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repoRoot, 'doc', 'questionnaire');
const outRoot = join(repoRoot, 'app', 'content', 'questions', 'en');

// Build one file's items. Exported so tests can exercise it with a mock llm.
export async function buildFile({ filename, questionsMd, answersMd, llm }) {
  const parsed = parseFilename(filename);
  const { subject, date, time } = parsed;
  // Prefer the grade in the document; fall back to a `-g<N>` filename suffix.
  const grade = parseGrade(questionsMd) ?? parsed.grade;
  const answers = parseAnswers(answersMd || '');
  const raw = parseQuestions(questionsMd);

  const items = [];
  const review = [];
  for (const q of raw) {
    for (const part of splitMultiPart(q)) {
      const answer = answers[q.number] || null;
      const built = await buildItem(part, answer, { llm });
      const idSuffix = part.part ? `${q.number}${part.part}` : `${q.number}`;
      const item = {
        // Grade is part of the id: sibling sets (e.g. `..._23-09.md` and
        // `..._23-09-g4.md`) share a date/time stamp and would otherwise collide.
        id: `${subject}_g${grade || 'x'}_${date || 'x'}_${time || 'x'}_q${idSuffix}`,
        grade,
        subject,
        // The heading the question was authored under — kept for provenance so a remap
        // costs a table edit, not a content rebuild.
        sourceSubtopic: part.subtopic || 'General',
        // The legacy subtopic id this is filed under (obs_app.py SUBTOPICS). The old app
        // curated a fixed list and generated questions on demand, so nothing was ever filed
        // against it; authored questions have to be mapped. See lib/subtopic-map.mjs.
        subtopic: mapSubtopic(subject, grade, part.subtopic || '').id,
        question: part.text,
        options: built.options,
        correctIndex: built.correctIndex,
        explanation: answer ? answer.explanation || '' : '',
        source: built.source,
        needsReview: built.needsReview,
      };
      items.push(item);
      if (built.needsReview) {
        review.push({ id: item.id, grade, subject, reason: built.reviewReason || 'flagged' });
      }
    }
  }
  return { items, review };
}

function pairsIn(dir) {
  const files = readdirSync(dir).filter((f) => /^practice_questions_.*\.md$/i.test(f));
  return files.map((qf) => ({ qf, af: qf.replace(/^practice_questions_/, 'answers_') }));
}

async function main() {
  if (!existsSync(srcDir)) {
    console.error(`No source dir: ${srcDir}`);
    process.exit(1);
  }
  const llm = createLLM();
  if (!llm) {
    console.warn('⚠  No OPENAI_API_KEY — free-response items will be flagged needsReview, not converted.');
  }

  const buckets = new Map(); // "grade/subject/slug" -> items[]
  const allReview = [];

  for (const { qf, af } of pairsIn(srcDir)) {
    const questionsMd = readFileSync(join(srcDir, qf), 'utf8');
    const answersMd = existsSync(join(srcDir, af)) ? readFileSync(join(srcDir, af), 'utf8') : '';
    const { items, review } = await buildFile({ filename: qf, questionsMd, answersMd, llm });
    allReview.push(...review);
    for (const it of items) {
      // Only ship well-formed MCQ items. needsReview items (e.g. free-response the
      // parser couldn't convert to A/B/C/D without an LLM) have empty options and would
      // render as unanswerable cards — keep them OUT of the served JSON + manifest. They
      // remain listed in tools/review-report.md for the post-deploy validation pass.
      if (it.needsReview) continue;
      const key = `${it.grade}/${it.subject}/${it.subtopic}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
  }

  let fileCount = 0;
  let itemCount = 0;
  const manifest = { generatedAt: new Date().toISOString(), grades: {} };
  for (const [key, items] of buckets) {
    const [grade, subject, sub] = key.split('/');
    const dir = join(outRoot, grade, subject);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sub}.json`), JSON.stringify(items, null, 2) + '\n');
    fileCount++;
    itemCount += items.length;

    /* Manifest lets the static browser flow enumerate subtopics without a directory
       listing. It carries only ids and counts: the display name, description, icon and
       colour come from app/js/subtopics-data.js, which is the legacy taxonomy. That keeps
       one source of truth for what a subtopic is CALLED, separate from what it CONTAINS. */
    (manifest.grades[grade] ||= {});
    (manifest.grades[grade][subject] ||= []);
    manifest.grades[grade][subject].push({ subtopic: sub, slug: sub, count: items.length });
  }
  for (const g of Object.values(manifest.grades)) {
    for (const subj of Object.keys(g)) g[subj].sort((a, b) => a.subtopic.localeCompare(b.subtopic));
  }
  writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const report =
    `# Content Review Report\n\nGenerated: ${new Date().toISOString()}\n\n` +
    `Items needing review: **${allReview.length}**\n\n` +
    (allReview.length
      ? '| id | grade | subject | reason |\n|---|---|---|---|\n' +
        allReview.map((r) => `| ${r.id} | ${r.grade} | ${r.subject} | ${r.reason} |`).join('\n') + '\n'
      : '_None — all items converted cleanly._\n');
  writeFileSync(join(repoRoot, 'tools', 'review-report.md'), report);

  console.log(`✔ Wrote ${itemCount} items across ${fileCount} JSON files + manifest.json.`);
  console.log(`✔ Review report: tools/review-report.md (${allReview.length} flagged).`);
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith('build-content.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
