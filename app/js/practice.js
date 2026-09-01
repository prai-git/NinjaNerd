/* Practice page (mirrors legacy obs_templates/exercise.html): an MCQ exercise
   checked CLIENT-SIDE (no runtime LLM). The interaction faithfully follows the
   legacy flow: radio options + a "Submit Answer" button, then a result banner
   with Next / Finish, and — on a wrong answer — an Explanation card in the right
   sidebar (above Progress). Question and option order are randomized via the pure
   helpers in quiz.js. Login is required to start.

   Forced divergences from legacy (static host, no runtime LLM), flagged per the
   working rules:
   - The legacy "Hint" card is omitted — the authored content carries no hint data.
   - The grade>=5 Collaboration sidebar/chat is DROPPED (owner, 2026-09-01), not deferred:
     child-to-child messaging is out of scope for launch. */
import { loadSubtopic } from './content-loader.js';
import { param, subjectLabel, requireLogin, renderInline, emitAttempt } from './flow.js';
import { buildAttempt } from './quiz.js';
import { renderMath } from './math-render.js';

async function init(root) {
  const grade = Number(param('grade'));
  const subject = param('subject');
  const subtopic = param('subtopic');
  if (!(grade >= 1 && grade <= 6) || !subject || !subtopic) { location.replace('index.html'); return; }

  const q = `grade=${grade}&subject=${subject}&subtopic=${encodeURIComponent(subtopic)}`;
  if (!requireLogin(`pages/practice.html?${q}`)) return;

  document.getElementById('nn-practice-title').textContent = `Practice · Grade ${grade} · ${subjectLabel(subject)}`;
  document.getElementById('nn-back-explore').href = `pages/explore.html?${q}`;

  const source = await loadSubtopic({ grade, subject, slug: subtopic });
  const content = root.querySelector('#nn-question-content');
  if (!source.length) {
    content.innerHTML = '<div class="alert alert-info">No questions available for this subtopic yet.</div>';
    return;
  }
  runQuiz(root, buildAttempt(source), { grade, subject, subtopic });
}

function runQuiz(root, deck, meta) {
  const counter = root.querySelector('#nn-question-counter');
  const content = root.querySelector('#nn-question-content');
  const answerSection = root.querySelector('#nn-answer-section');
  const optionsContainer = root.querySelector('#nn-options-container');
  const submitBtn = root.querySelector('#nn-submit-btn');
  const resultSection = root.querySelector('#nn-result-section');
  const resultMessage = root.querySelector('#nn-result-message');
  const nextBtn = root.querySelector('#nn-next-btn');
  const finishBtn = root.querySelector('#nn-finish-btn');
  const explanationCard = root.querySelector('#nn-explanation-card');
  const explanationContent = root.querySelector('#nn-explanation-content');
  const bar = root.querySelector('#nn-progress');
  const progressText = root.querySelector('#nn-progress-text');

  let i = 0; let score = 0;

  // Back to Explore acts as the exit; Finish returns the student to the subtopic list.
  const topicsHref = `pages/subtopics.html?grade=${meta.grade}&subject=${meta.subject}`;

  function displayQuestion() {
    const item = deck[i];
    counter.textContent = `Question ${i + 1} of ${deck.length}`;
    /* The reading passage above the question. Practice items that ask "According to the
       passage..." are unanswerable without it. Collapsible because a long passage would push
       the options off screen, and the student re-reads it per question in the same set. */
    const passageHtml = item.passage ? `
      <details class="nn-passage-details mb-3" open>
        <summary class="fw-semibold text-secondary">
          <i class="fas fa-book-open me-2"></i>${item.passageTitle
            ? renderInline(item.passageTitle) : 'Read the passage'}
        </summary>
        <div class="nn-passage bg-light border-start border-4 border-secondary p-3 rounded mt-2">
          ${renderInline(item.passage)}
        </div>
      </details>` : '';
    content.innerHTML = `${passageHtml}<h5>${renderInline(item.question)}</h5>`;

    const pct = (i / deck.length) * 100;
    bar.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    progressText.textContent = `Question ${i + 1} of ${deck.length}`;

    optionsContainer.innerHTML = '';
    item.options.forEach((option, index) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'form-check';
      const input = document.createElement('input');
      input.className = 'form-check-input';
      input.type = 'radio';
      input.name = 'answer-option';
      input.id = `nn-option-${index}`;
      input.value = String(index);
      const label = document.createElement('label');
      label.className = 'form-check-label';
      label.setAttribute('for', `nn-option-${index}`);
      label.innerHTML = renderInline(option);
      optionDiv.append(input, label);
      optionsContainer.appendChild(optionDiv);
    });

    answerSection.style.display = 'block';
    resultSection.style.display = 'none';
    explanationCard.style.display = 'none';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-check me-1"></i>Submit Answer';
    // Typeset the question, passage and options together, after they are in the DOM.
    renderMath(content);
    renderMath(optionsContainer);
  }

  function submitAnswer() {
    const selected = optionsContainer.querySelector('input[name="answer-option"]:checked');
    if (!selected) { window.alert('Please select an answer before submitting.'); return; }
    const choice = Number(selected.value);
    const item = deck[i];
    const correct = choice === item.correctIndex;
    if (correct) score++;

    /* The legacy record (obs_app.py) stored the question TEXT and the chosen option TEXT, not
       ids, plus `topic` — the subject. Statistics groups by topic, and Audit renders the
       question and the child's answer without loading the content JSON. Passing only an id
       would make both impossible and would break old records if a question is reworded. */
    emitAttempt({
      questionId: item.id,
      question: item.question,
      userAnswer: item.options[choice],
      correct,
      topic: meta.subject,
      subtopic: meta.subtopic,
      grade: meta.grade,
    });
    showResult({ item, choice, correct });
  }

  function showResult({ item, choice, correct }) {
    answerSection.style.display = 'none';
    resultSection.style.display = 'block';

    if (correct) {
      resultMessage.className = 'alert alert-success';
      resultMessage.innerHTML = '<i class="fas fa-check-circle me-1"></i><strong>Correct!</strong> Well done!';
      explanationCard.style.display = 'none';
    } else {
      resultMessage.className = 'alert alert-danger';
      resultMessage.innerHTML = "<i class=\"fas fa-times-circle me-1\"></i><strong>Incorrect.</strong> Let's learn from this!";
      let html = `<div class="mb-3">
          <h6 class="text-muted"><i class="fas fa-edit me-1"></i>Your Answer:</h6>
          <div class="bg-light p-2 rounded border">${renderInline(item.options[choice])}</div>
        </div>
        <div class="mb-3">
          <h6 class="text-success"><i class="fas fa-check me-1"></i>Correct Answer:</h6>
          <div class="bg-light p-2 rounded border">${renderInline(item.options[item.correctIndex])}</div>
        </div>`;
      if (item.explanation) {
        html += `<div>
          <h6 class="text-primary"><i class="fas fa-lightbulb me-1"></i>Explanation:</h6>
          <div>${renderInline(item.explanation)}</div>
        </div>`;
      }
      explanationContent.innerHTML = html;
      renderMath(explanationContent);
      explanationCard.style.display = 'block';
    }

    const last = i + 1 >= deck.length;
    nextBtn.style.display = last ? 'none' : 'inline-block';
    finishBtn.style.display = last ? 'inline-block' : 'none';
  }

  function next() {
    i++;
    if (i < deck.length) displayQuestion(); else showFinished();
  }

  function showFinished() {
    const pct = Math.round((score / deck.length) * 100);
    bar.style.width = '100%';
    bar.setAttribute('aria-valuenow', '100');
    progressText.textContent = 'Complete';
    content.innerHTML = `<div class="text-center">
        <h4><i class="fas fa-trophy text-warning me-2"></i>Exercise Completed!</h4>
        <p class="mb-1">Great job! You scored <strong>${score} / ${deck.length}</strong> (${pct}%).</p>
      </div>`;
    answerSection.style.display = 'none';
    explanationCard.style.display = 'none';
    resultSection.style.display = 'block';
    resultMessage.className = 'alert alert-success';
    resultMessage.innerHTML = '<i class="fas fa-star me-1"></i>Congratulations on completing the exercise!';
    nextBtn.style.display = 'none';
    finishBtn.style.display = 'inline-block';
  }

  submitBtn.addEventListener('click', submitAnswer);
  nextBtn.addEventListener('click', next);
  finishBtn.addEventListener('click', () => { location.href = topicsHref; });

  displayQuestion();
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-practice');
  if (root) init(root);
});
