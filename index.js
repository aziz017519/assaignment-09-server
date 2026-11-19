// Compatibility entry point so `nodemon index.js` and `node index.js` work.
// The real application lives in src/server.ts and is loaded through tsx.
import 'tsx/esm';
await import('./src/server.ts');
