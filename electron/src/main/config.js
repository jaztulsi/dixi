// Keys and model choices from the same .env the Swift app uses (repo root), or electron/.env.
// Read only in the main process.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  const vars = {};
  for (const file of [path.resolve(here, '../../../.env'), path.resolve(here, '../../.env')]) {
    dotenv.config({ path: file, processEnv: vars, quiet: true });
  }
  const pick = (k) => (env[k] || vars[k] || '').trim();
  return {
    groqAPIKey: pick('GROQ_API_KEY'),
    deepgramAPIKey: pick('DEEPGRAM_API_KEY'),
    // Groq retires preview models often, so these can be overridden in .env (same keys as the Swift app).
    agentModel: pick('AGENT_MODEL') || 'qwen/qwen3.8-27b',
    voiceModel: pick('VOICE_MODEL') || 'openai/gpt-oss-20b',
  };
}
