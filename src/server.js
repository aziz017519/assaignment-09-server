import { app } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

// Local/dev entry point only. Vercel imports index.js -> src/app.js directly,
// so no listen() or startup DB work runs during a serverless cold start.
connectDB()
    .then(() => {
        if (env.NODE_ENV === 'test')
            return;
        app.listen(env.PORT, () => {
            console.log(`[fixmate] server listening on port ${env.PORT}`);
        });
    })
    .catch((error) => {
        console.error('[fixmate] failed to start server:', error);
        process.exitCode = 1;
    });

export default app;
