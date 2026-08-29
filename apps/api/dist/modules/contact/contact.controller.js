import { contactMessageQuerySchema, contactMessageSubmitRequestSchema, contactMessageUpdateRequestSchema, } from '@siders/contracts';
import { toContactMessageRow, toContactMessageSubmitResponse } from './contact.mapper.js';
import { requireUuidParam } from '../../lib/requireParam.js';
/** Parse, delegate, respond. Public (unauthenticated) submission endpoint. */
export function createPublicContactController(service) {
    return {
        async submit(req, res, next) {
            try {
                const body = contactMessageSubmitRequestSchema.parse(req.body);
                const row = await service.submit(body);
                res.status(201).json({ success: true, data: toContactMessageSubmitResponse(row) });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
/** Parse, delegate, respond. Admin (permission-gated) inbox endpoints. */
export function createContactMessageController(service) {
    return {
        async list(req, res, next) {
            try {
                const query = contactMessageQuerySchema.parse(req.query);
                const rows = await service.list(query.status);
                res.json({ success: true, data: rows.map(toContactMessageRow) });
            }
            catch (err) {
                next(err);
            }
        },
        async unreadCount(_req, res, next) {
            try {
                const value = await service.countUnread();
                res.json({ success: true, data: { count: value } });
            }
            catch (err) {
                next(err);
            }
        },
        async updateStatus(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = contactMessageUpdateRequestSchema.parse(req.body);
                const row = await service.setStatus(id, body.status);
                res.json({ success: true, data: toContactMessageRow(row) });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
