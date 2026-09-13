import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { ProposeAnswerRequestSchema } from './schemas.js';
import type { GeminiAnswerProvider } from './gemini-provider.js';
import { sanitizeDiagnostic } from './safe.js';

function readJsonBody(req: IncomingMessage, limitBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, {
    status: 'error',
    message: 'Not found.',
  });
}

/**
 * Minimal local HTTP boundary:
 *   POST /v1/propose-answer  { context: AiQuestionContext }
 *   GET  /healthz
 */
export function createBackendServer(provider: GeminiAnswerProvider): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, provider);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  provider: GeminiAnswerProvider,
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true, providerId: provider.id });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/propose-answer') {
    try {
      const body = await readJsonBody(req, 32_768);
      const parsed = ProposeAnswerRequestSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, {
          status: 'error',
          message: 'Invalid propose-answer request.',
        });
        return;
      }

      const proposal = await provider.proposeAnswer(parsed.data.context);
      sendJson(res, 200, proposal);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? sanitizeDiagnostic(error.message)
          : 'Propose-answer failed.';
      sendJson(res, 500, {
        status: 'error',
        message: message || 'Propose-answer failed.',
      });
    }
    return;
  }

  notFound(res);
}
