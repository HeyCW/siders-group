import pino from 'pino';
// pino-http logs the full request/response headers, which would otherwise put session
// cookies and bearer tokens in plaintext in every access log line.
const REDACT_PATHS = [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
];
export function createLogger(env) {
    const options = { level: env.LOG_LEVEL, redact: REDACT_PATHS };
    if (env.NODE_ENV === 'development') {
        options.transport = { target: 'pino-pretty', options: { colorize: true } };
    }
    return pino(options);
}
