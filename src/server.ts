import { app } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';

async function start(): Promise<void> {
  await connectDB();
  if (env.NODE_ENV === 'test') return;

  app.listen(env.PORT, () => {
    console.log(`[fixmate] server listening on port ${env.PORT}`);
  });
}

start().catch((error: unknown) => {
  console.error('[fixmate] failed to start server:', error);
  process.exitCode = 1;
});

export default app;
