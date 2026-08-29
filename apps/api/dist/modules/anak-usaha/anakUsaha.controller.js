import { anakUsahaCreateRequestSchema, anakUsahaProfileCreateRequestSchema, anakUsahaProfileReorderRequestSchema, anakUsahaProfileUpdateRequestSchema, anakUsahaUpdateRequestSchema, } from '@siders/contracts';
import { toAnakUsahaAdminResponse, toAnakUsahaResponse, toPublicAnakUsaha } from './anakUsaha.mapper.js';
import { requireUuidParam } from '../../lib/requireParam.js';
/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createAnakUsahaController(service, env) {
    return {
        /** Public listing — unchanged shape for entries without an active profile, so existing
         *  consumers (article tagging, the `/news` filter) are unaffected
         *  (specs/anak-usaha-presentation/spec.md - "Public anak usaha listing carries presentation
         *  fields without breaking existing consumers"). */
        async list(_req, res, next) {
            try {
                const rows = await service.listWithProfile();
                res.json({ success: true, data: rows.map((row) => toPublicAnakUsaha(env, row)) });
            }
            catch (err) {
                next(err);
            }
        },
        /** The admin presentation screen's listing — every entry, profile fields included even when
         *  inactive, so staff can edit a hidden profile. */
        async listAdmin(_req, res, next) {
            try {
                const rows = await service.listWithProfile();
                res.json({ success: true, data: rows.map((row) => toAnakUsahaAdminResponse(env, row)) });
            }
            catch (err) {
                next(err);
            }
        },
        async create(req, res, next) {
            try {
                const body = anakUsahaCreateRequestSchema.parse(req.body);
                const row = await service.create(body.name);
                res.status(201).json({ success: true, data: toAnakUsahaResponse(row) });
            }
            catch (err) {
                next(err);
            }
        },
        async update(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = anakUsahaUpdateRequestSchema.parse(req.body);
                const row = await service.update(id, body.name);
                res.json({ success: true, data: toAnakUsahaResponse(row) });
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
        async createProfile(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = anakUsahaProfileCreateRequestSchema.parse(req.body);
                await service.createProfile(id, body);
                const row = await service.findWithProfile(id);
                if (!row)
                    throw new Error('anak usaha missing immediately after profile create');
                res.status(201).json({ success: true, data: toAnakUsahaAdminResponse(env, row) });
            }
            catch (err) {
                next(err);
            }
        },
        async updateProfile(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = anakUsahaProfileUpdateRequestSchema.parse(req.body);
                await service.updateProfile(id, body);
                const row = await service.findWithProfile(id);
                if (!row)
                    throw new Error('anak usaha missing immediately after profile update');
                res.json({ success: true, data: toAnakUsahaAdminResponse(env, row) });
            }
            catch (err) {
                next(err);
            }
        },
        async removeProfile(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                await service.deleteProfile(id);
                res.status(204).end();
            }
            catch (err) {
                next(err);
            }
        },
        async reorderProfiles(req, res, next) {
            try {
                const body = anakUsahaProfileReorderRequestSchema.parse(req.body);
                const rows = await service.reorderProfiles(body.anakUsahaIds);
                res.json({ success: true, data: rows.map((row) => toAnakUsahaAdminResponse(env, row)) });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
