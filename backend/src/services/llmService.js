const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-5';
const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || '2', 10);
const TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '15000', 10);

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM request timed out')), ms)),
  ]);
}

async function callClaude(systemPrompt, userPrompt) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await withTimeout(
        client.messages.create({
          model: MODEL,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        TIMEOUT_MS
      );
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return text;
    } catch (err) {
      lastErr = err;
      // Exponential backoff before retrying (skip wait on the last attempt)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function safeParseJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Pre-visit summary: symptoms -> urgency, chief complaint, suggested questions.
 * Returns { summary, error } - never throws, so a caller can persist
 * aiStatus='failed' and let the doctor proceed with the raw symptom text.
 */
async function generatePreVisitSummary(symptomsText) {
  const systemPrompt =
    'You are a clinical intake assistant. You only summarize what the patient wrote; ' +
    'you never diagnose or prescribe. Always respond with ONLY a JSON object, no other text, ' +
    'in the exact shape: {"urgency": "Low"|"Medium"|"High", "chiefComplaint": string, ' +
    '"suggestedQuestions": [string, string, string]}.';
  const userPrompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptomsText}`;

  try {
    const raw = await callClaude(systemPrompt, userPrompt);
    const parsed = safeParseJson(raw);
    if (!parsed.urgency || !parsed.chiefComplaint || !Array.isArray(parsed.suggestedQuestions)) {
      throw new Error('LLM returned an unexpected shape');
    }
    return { summary: parsed, error: null };
  } catch (err) {
    return { summary: null, error: err.message };
  }
}

/**
 * Post-visit summary: clinical notes -> patient-friendly summary with
 * medication schedule and follow-up steps.
 */
async function generatePostVisitSummary(notes) {
  const systemPrompt =
    'You are a patient communication assistant. Rewrite clinical notes in plain, ' +
    'reassuring language a non-medical patient can understand. Include a clear ' +
    'medication schedule and follow-up steps as a bulleted list. Do not invent ' +
    'information that is not present in the notes.';
  const userPrompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}`;

  try {
    const summary = await callClaude(systemPrompt, userPrompt);
    return { summary, error: null };
  } catch (err) {
    return { summary: null, error: err.message };
  }
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
