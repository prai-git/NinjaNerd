/* Learn page (mirrors legacy learn.html): teaching mode. The static site has no
   runtime LLM, so Learn content is DERIVED from the authored question
   explanations — each item is shown as Question → Correct answer → Explanation,
   navigable with prev/next, then "Start Practice". Login required. */
import { loadSubtopic } from './content-loader.js';
import { param, subjectLabel, requireLogin, renderInline } from './flow.js';

async function init(root) {
  const grade = Number(param('grade'));
  const subject = param('subject');
  const subtopic = param('subtopic');
  if (!(grade >= 1 && grade <= 6) || !subject || !subtopic) { location.replace('/index.html'); return; }

  const q = `grade=${grade}&subject=${subject}&subtopic=${encodeURIComponent(subtopic)}`;
  if (!requireLogin(`/pages/learn.html?${q}`)) return;

  document.getElementById('nn-learn-title').textContent = `Learn · Grade ${grade} · ${subjectLabel(subject)}`;
  document.getElementById('nn-back-explore').href = `/pages/explore.html?${q}`;
  document.getElementById('nn-start-practice').href = `/pages/practice.html?${q}`;

  const items = await loadSubtopic({ grade, subject, slug: subtopic });
  const contentEl = root.querySelector('#nn-learn-content');
  if (!items.length) {
    contentEl.innerHTML = '<div class="alert alert-info">No learning content available for this subtopic yet.</div>';
    return;
  }

  let i = 0;
  const counter = root.querySelector('#nn-learn-counter');
  const badge = root.querySelector('#nn-learn-badge');
  const bar = root.querySelector('#nn-learn-progress');
  const overview = root.querySelector('#nn-learn-overview');
  const nav = root.querySelector('#nn-nav');
  const prev = root.querySelector('#nn-prev');
  const next = root.querySelector('#nn-next');
  const practice = root.querySelector('#nn-start-practice');
  practice.href = `/pages/practice.html?${q}`;
  nav.style.display = 'flex';

  function show() {
    const it = items[i];
    const answer = it.options && it.options[it.correctIndex];
    // Mirrors legacy learn.html: "Learning Question N", the question as a lead, then the
    // explanation in a light panel. (Legacy also showed LLM Examples + "Why this matters";
    // the static site has no runtime LLM, so those sections are absent.)
    contentEl.innerHTML = `
      <div class="learning-item">
        <h4 class="text-info mb-3"><i class="fas fa-question-circle me-2"></i>Learning Question ${i + 1}</h4>
        <div class="question-section mb-4">
          <h5>Question:</h5>
          <p class="lead">${renderInline(it.question)}</p>
        </div>
        ${answer ? `<div class="answer-section mb-4">
          <h5><i class="fas fa-check-circle me-2 text-success"></i>Correct Answer:</h5>
          <div class="bg-success bg-opacity-10 p-3 rounded">${renderInline(answer)}</div>
        </div>` : ''}
        ${it.explanation ? `<div class="explanation-section mb-2">
          <h5><i class="fas fa-book me-2 text-primary"></i>Detailed Explanation:</h5>
          <div class="bg-light p-3 rounded">${renderInline(it.explanation)}</div>
        </div>` : ''}
      </div>`;
    counter.textContent = `Learning Content ${i + 1} of ${items.length}`;
    badge.textContent = `${i + 1}/${items.length}`;
    bar.style.width = `${((i + 1) / items.length) * 100}%`;
    overview.innerHTML = `
      <p class="mb-1"><strong>Content Items:</strong> ${items.length}</p>
      <p class="mb-0"><strong>Current Position:</strong> ${i + 1}</p>`;

    prev.disabled = i === 0;
    const last = i === items.length - 1;
    next.style.display = last ? 'none' : 'block';
    practice.style.display = last ? 'block' : 'none';
  }

  prev.addEventListener('click', () => { if (i > 0) { i--; show(); } });
  next.addEventListener('click', () => { if (i < items.length - 1) { i++; show(); } });
  show();
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-learn');
  if (root) init(root);
});
