/* Explore page (mirrors legacy explore.html): choose Learn or Practice for a
   subtopic. Browsing here is public; the LOGIN GATE fires when the student
   commits to an activity (Learn or Practice), then returns them to it. */
import { loadManifest, subtopicsFor } from './content-loader.js';
import { param, subjectLabel, requireLogin } from './flow.js';

async function init(root) {
  const grade = Number(param('grade'));
  const subject = param('subject');
  const subtopic = param('subtopic');
  if (!(grade >= 1 && grade <= 6) || !subject || !subtopic) { location.replace('/index.html'); return; }

  const q = `grade=${grade}&subject=${subject}&subtopic=${encodeURIComponent(subtopic)}`;
  document.getElementById('nn-back-subtopics').href =
    `/pages/subtopics.html?grade=${grade}&subject=${subject}`;

  // Resolve the friendly subtopic name from the manifest (falls back to the slug).
  const manifest = await loadManifest();
  const match = manifest ? subtopicsFor(manifest, grade, subject).find((s) => s.slug === subtopic) : null;
  const name = (match && match.subtopic) || subtopic;
  document.getElementById('nn-explore-title').textContent =
    `Explore ${subjectLabel(subject)} - ${name} - Grade ${grade}`;
  document.getElementById('nn-explore-subtopic').textContent = name;

  // Gate the activity: if not signed in, requireLogin redirects to login with a
  // next= back to the chosen activity so the student lands where they intended.
  const go = (page) => {
    const target = `/pages/${page}.html?${q}`;
    if (requireLogin(target)) location.href = target;
  };
  root.querySelector('#nn-learn-card').addEventListener('click', () => go('learn'));
  root.querySelector('#nn-practice-card').addEventListener('click', () => go('practice'));
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('nn-explore');
  if (root) init(root);
});
