/**
 * Phusion Passenger entry point (Plesk's Node.js hosting runs `node <startup file>`).
 *
 * `next start` is a command, not a file, so Passenger cannot invoke it. This is the equivalent
 * custom server: it serves the prebuilt `.next` output, so `pnpm --filter @siders/web build`
 * must have run before this starts.
 *
 * Passenger injects `PORT`; the fallback matches `next start`'s default.
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import next from 'next';

// Resolved from this module's own URL rather than `process.cwd()` — Passenger's working
// directory is the application root, which is the repo root, not this app.
const dir = fileURLToPath(new URL('.', import.meta.url));

const app = next({ dev: false, dir });
const handle = app.getRequestHandler();

await app.prepare();

createServer((req, res) => {
  handle(req, res);
}).listen(Number(process.env.PORT ?? 3000));
