import { categoryCreateRequestSchema, categoryUpdateRequestSchema } from '@siders/contracts';
import { toCategoryResponse } from './category.mapper.js';
import { requireUuidParam } from '../../lib/requireParam.js';
/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createCategoryController(service) {
    return {
        async list(_req, res, next) {
            try {
                const rows = await service.list();
                res.json({ success: true, data: rows.map(toCategoryResponse) });
            }
            catch (err) {
                next(err);
            }
        },
        async create(req, res, next) {
            try {
                const body = categoryCreateRequestSchema.parse(req.body);
                const row = await service.create(body.name);
                res.status(201).json({ success: true, data: toCategoryResponse(row) });
            }
            catch (err) {
                next(err);
            }
        },
        async update(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = categoryUpdateRequestSchema.parse(req.body);
                const row = await service.update(id, body.name);
                res.json({ success: true, data: toCategoryResponse(row) });
            }
            catch (err) {
                next(err);
            }
        },
        async remove(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                await service.delete(id);
                res.status(204).end();
            }
            catch (err) {
                next(err);
            }
        },
    };
}
