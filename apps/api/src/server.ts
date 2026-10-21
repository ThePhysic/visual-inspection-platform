import { buildApp } from './app.js';
import { readConfig } from './config.js';

async function main() {
  const config = readConfig(process.env);
  const app = buildApp({ logger: true });

  async function shutdown(signal: string) {
    app.log.info({ signal }, 'Shutting down API');
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, 'API shutdown failed');
      process.exitCode = 1;
    }
  }

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

  try {
    await app.listen(config);
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error('API startup failed.', error);
  process.exitCode = 1;
});
