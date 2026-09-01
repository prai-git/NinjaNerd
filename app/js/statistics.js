/* Statistics page (prompt 08) — mirrors legacy obs_app.py:952 + obs_templates/statistics.html.

   The legacy computation, reproduced rather than reinvented:
     1. the displayed grade is the one with the MOST MATH answers, defaulting to 1;
     2. for each topic, percent correct WITHIN that grade, 0 when there are none;
     3. no history at all -> the legacy empty state.

   Percentages are still never stored -- they are computed on every view, as the Flask route
   did. What changed is where the COUNTS come from. Reading history cost one Firestore document
   read per answered question, up to 1000 per view of a page a child can refresh at will, and
   it got worse the more a student practised. `statistics/summary` now also carries a
   per-grade-per-topic roll-up, written in the same atomic batch as each history row, so the
   usual path is ONE read.

   History remains the fallback and the source of truth: if the roll-up does not exactly
   account for questions_attempted -- an account that practised before the roll-up existed --
   this reads history instead and is right. See stats-calc.js rollupIsComplete(). */

import { getHistory, getStatistics } from './data.js';
import {
  selectGrade, percentagesFor, TOPICS,
  rollupIsComplete, gradeFromRollup, percentagesFromRollup,
} from './stats-calc.js';

// Legacy chart palette, carried over verbatim so the page looks the same.
const FILL = [
  'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 205, 86, 0.8)',
  'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)',
];
const STROKE = [
  'rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 205, 86, 1)',
  'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)',
];

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function emptyState() {
  // Legacy markup: fa-chart-bar fa-5x, "No Statistics Available".
  return `
    <div class="text-center">
      <i class="fas fa-chart-bar fa-5x text-muted mb-3"></i>
      <h4>No Statistics Available</h4>
      <p class="text-muted">Start solving questions to see your progress statistics!</p>
    </div>`;
}

function signedOutState() {
  return `
    <div class="text-center">
      <i class="fas fa-lock fa-5x text-muted mb-3"></i>
      <h4>Sign in to see your statistics</h4>
      <p class="text-muted">Your progress is saved to your account.</p>
      <a class="btn btn-primary" href="pages/login.html?next=pages/statistics.html">
        <i class="fas fa-sign-in-alt me-1"></i>Login
      </a>
    </div>`;
}

function statsMarkup(pct) {
  const cards = TOPICS.map((t) => `
    <div class="col-md-4 col-sm-4 col-6 mb-3">
      <div class="card text-center">
        <div class="card-body">
          <h5 class="card-title">${title(t)}</h5>
          <h2 class="text-primary">${pct[t].toFixed(1)}%</h2>
        </div>
      </div>
    </div>`).join('');
  return `
    <div class="row mb-4">
      <div class="col-12"><canvas id="statisticsChart" width="400" height="200"></canvas></div>
    </div>
    <div class="row">${cards}</div>`;
}

function drawChart(pct, grade) {
  const el = document.getElementById('statisticsChart');
  // Chart.js is a CDN script; if it failed to load the numbers above are still correct.
  if (!el || typeof window.Chart === 'undefined') return;
  new window.Chart(el.getContext('2d'), {
    type: 'bar',
    data: {
      labels: TOPICS.map(title),
      datasets: [{
        label: 'Score Percentage',
        data: TOPICS.map((t) => pct[t]),
        backgroundColor: FILL.slice(0, TOPICS.length),
        borderColor: STROKE.slice(0, TOPICS.length),
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: `Statistics for Grade ${grade}`, font: { size: 18 } },
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
      },
    },
  });
}

async function render() {
  const body = document.getElementById('nn-stats-body');
  const gradeEl = document.getElementById('nn-stats-grade');
  if (!body) return;

  const user = window.NNAuth && window.NNAuth.getUser();
  if (!user) { body.innerHTML = signedOutState(); if (gradeEl) gradeEl.textContent = '—'; return; }

  /* One document read on the normal path. Only fall back to the full history scan when the
     roll-up cannot account for every attempt. */
  const summary = await getStatistics();
  let grade;
  let pct;
  let hasAny;

  if (rollupIsComplete(summary)) {
    grade = gradeFromRollup(summary);
    pct = percentagesFromRollup(summary, grade);
    hasAny = true; // rollupIsComplete() already required a non-zero total
  } else {
    const history = await getHistory();
    grade = selectGrade(history);
    pct = percentagesFor(history, grade);
    hasAny = history.length > 0;
  }

  if (gradeEl) gradeEl.textContent = String(grade);
  if (!hasAny) { body.innerHTML = emptyState(); return; }

  body.innerHTML = statsMarkup(pct);
  drawChart(pct, grade);
}

/* Firebase restores the session after first paint, so render once immediately (the display
   cache usually has the answer) and again when the real state lands. */
document.addEventListener('DOMContentLoaded', render);
document.addEventListener('nn-auth-changed', render);
