/* Dev-time ONLY OpenAI adapter for free-response → MCQ distractor generation
   (prompt 03). Never bundled into `app/`, never called at runtime in the browser.
   Tests never touch this file — they inject their own mock `llm` into mcq.mjs.

   createLLM() returns either:
     - a real async fn (question, correct) -> string[] of 3 distractors, or
     - null when no OPENAI_API_KEY is set (build then flags items needsReview). */

export function createLLM({ apiKey = process.env.OPENAI_API_KEY, fetchImpl = globalThis.fetch, model = 'gpt-4o-mini' } = {}) {
  if (!apiKey) return null;

  return async function llm({ question, correct }) {
    const prompt =
      'You write multiple-choice DISTRACTORS for a K-6 practice question.\n' +
      'Return ONLY a JSON array of exactly 3 plausible-but-wrong answer strings.\n' +
      'Do NOT include the correct answer. Keep them grade-appropriate.\n\n' +
      'Question:\n' + question + '\n\nCorrect answer (do not repeat):\n' + correct;

    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('OpenAI HTTP ' + res.status);
    const data = await res.json();
    const content = (((data.choices || [])[0] || {}).message || {}).content || '[]';
    const arr = JSON.parse(content.replace(/^```json\s*|```$/g, '').trim());
    if (!Array.isArray(arr)) throw new Error('LLM did not return a JSON array');
    return arr.map((x) => String(x));
  };
}
