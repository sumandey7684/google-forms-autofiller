import { loadBackendConfig, describeConfig } from './config.js';
import { GeminiAnswerProvider } from './gemini-provider.js';
import { createBackendServer } from './server.js';

async function main(): Promise<void> {
  const config = loadBackendConfig();
  const provider = new GeminiAnswerProvider(config);
  const server = createBackendServer(provider);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });

  // Never log the API key or request payloads.
  console.info(
    `[backend] Gemini proxy listening (${describeConfig(config)})`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Backend failed to start.';
  // Avoid dumping env objects.
  console.error(`[backend] startup failed: ${message}`);
  process.exit(1);
});
