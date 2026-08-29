import { revalidateHomePath } from '../../lib/revalidate.js';
import { toHomeCurationEntryResponse } from './curation.mapper.js';
export function createHomeCurationService(repository, revalidateEnv, logger) {
    return {
        async list() {
            const rows = await repository.list();
            const now = new Date();
            return rows.map((row) => toHomeCurationEntryResponse(row, now));
        },
        async replace(articleIds) {
            const rows = await repository.replace(articleIds);
            await revalidateHomePath(revalidateEnv, logger);
            const now = new Date();
            return rows.map((row) => toHomeCurationEntryResponse(row, now));
        },
    };
}
