import { AppError } from '../../middleware/errorHandler.js';
/** No `RevalidateEnv` or `Logger` — a submission never changes anything the public site renders,
 *  mirroring `createPublicPartnerService`'s reasoning for its own minimal shape. */
export function createPublicContactService(repository) {
    return {
        submit(input) {
            return repository.submit(input);
        },
    };
}
export function createContactMessageService(repository) {
    return {
        list(filter) {
            return repository.list(filter);
        },
        countUnread() {
            return repository.countUnread();
        },
        async setStatus(id, status) {
            const updated = await repository.setStatus(id, status);
            if (!updated)
                throw new AppError('Contact message not found', 404, 'not_found');
            return updated;
        },
    };
}
