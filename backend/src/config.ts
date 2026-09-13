import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

/**
 * Minimal .env loader. Does not print values.
 * Load order (later file wins for the same key):
 *   backend/.env → root/.env → backend/.env.local → root/.env.local
 * Existing process.env values always win over file values.
 */
function loadDotEnvFiles(): void {
  const candidates = [
    join(REPO_ROOT, 'backend', '.env'),
    join(REPO_ROOT, '.env'),
    join(REPO_ROOT, 'backend', '.env.local'),
    join(REPO_ROOT, '.env.local'),
  ];
  const fromFiles: Record<string, string> = {};

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      fromFiles[key] = value;
    }
  }

  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export interface BackendConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  host: string;
  port: number;
}

function requireNonEmpty(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    throw new Error(`${name} is required in the backend environment.`);
  }
  return trimmed;
}

function parsePositiveInt(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

/**
 * Load backend configuration. API key never leaves this process via returned
 * objects that are logged — callers must not log `geminiApiKey`.
 */
export function loadBackendConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig {
  loadDotEnvFiles();
  return {
    geminiApiKey: requireNonEmpty('GEMINI_API_KEY', env.GEMINI_API_KEY),
    geminiModel:
      env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    geminiTimeoutMs: parsePositiveInt(
      'GEMINI_TIMEOUT_MS',
      env.GEMINI_TIMEOUT_MS,
      15_000,
    ),
    host: env.BACKEND_HOST?.trim() || '127.0.0.1',
    port: parsePositiveInt('BACKEND_PORT', env.BACKEND_PORT, 8787),
  };
}

/** Safe summary for startup logs — never includes the API key. */
export function describeConfig(config: BackendConfig): string {
  return [
    `host=${config.host}`,
    `port=${config.port}`,
    `model=${config.geminiModel}`,
    `timeoutMs=${config.geminiTimeoutMs}`,
    'apiKey=set',
  ].join(' ');
}
