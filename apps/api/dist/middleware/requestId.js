import { randomUUID } from 'node:crypto';
export function requestId(req, res, next) {
    req.requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
}
