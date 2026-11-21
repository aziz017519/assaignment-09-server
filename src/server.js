import { app } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

if (process.env.VERCEL === '1') {
    // Vercel imports this module as a serverless function. Do not listen on a
    // port; database connections are cached in src/config/db.js across calls.
    connectDB().catch((error) => {
        console.error('[fixmate] failed to initialize database:', error);
    });
} else {
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
}

export default app;
