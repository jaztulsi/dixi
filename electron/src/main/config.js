// Keys and settings from .env (repo root or electron/), read only in the main process.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS } from './providers.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  const vars = {};
  for (const file of [path.resolve(here, '../../../.env'), path.resolve(here, '../../.env')]) {
    dotenv.config({ path: file, processEnv: vars, quiet: true });
  }
  const merged = { ...vars, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v != null && v !== '')) };
  const pick = (k) => (merged[k] || '').trim();
  const keys = Object.fromEntries(Object.entries(ENDPOINTS).filter(([, e]) => e.key).map(([p, e]) => [p, pick(e.key)]));
  return {
    env: merged,
    keys,
    groqAPIKey: keys.groq,
    deepgramAPIKey: keys.deepgram,
    spendCapUSD: Number(pick('DIXI_SPEND_CAP') || 25),
  };
}
