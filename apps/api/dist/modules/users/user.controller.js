import { AppError } from '../../middleware/errorHandler.js';
/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createUserController(service) {
    return {
        async getMe(req, res, next) {
            try {
                const subjectId = req.auth?.subjectId;
                if (!subjectId)
                    throw new AppError('Not authenticated', 401, 'unauthenticated');
                // Sourced from `req.staffRole`, populated by `requireStaff` from the same
                // `resolveStaffAccess` call it already made — not a second, independent query
                // (design.md - "sources permissionKeys/isOwner from req.staffRole, not a second query").
                const access = { permissionKeys: req.staffRole?.permissionKeys ?? [], isOwner: req.staffRole?.isOwner ?? false };
                const user = await service.getById(subjectId, access);
                if (!user)
                    throw new AppError('User not found', 404, 'not_found');
                res.json({ success: true, data: user });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
