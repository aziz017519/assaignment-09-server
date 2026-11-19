import { app } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
async function start() {
    await connectDB();
    if (env.NODE_ENV === 'test')
        return;
    app.listen(env.PORT, () => {
        console.log(`[fixmate] server listening on port ${env.PORT}`);
    });
}
start().catch((error) => {
    console.error('[fixmate] failed to start server:', error);
    process.exitCode = 1;
});
export default app;
