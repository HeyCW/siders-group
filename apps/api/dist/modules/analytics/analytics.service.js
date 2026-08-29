import { toDashboardResponse } from './analytics.mapper.js';
export function createAnalyticsService(repository) {
    return {
        async getDashboard() {
            // One `now` shared by every tile, so the six sections describe the same instant rather
            // than six slightly different ones from staggered repository calls.
            const now = new Date();
            const [pipeline, cadence, contentDebt, curationIntegrity, upNext, readers, readership] = await Promise.all([
                repository.getPipelineCounts(),
                repository.getCadence(now),
                repository.getContentDebt(),
                repository.getCurationIntegrity(now),
                repository.getUpNext(now),
                repository.getReaderActivity(now),
                repository.getReadership(now),
            ]);
            return toDashboardResponse({ pipeline, cadence, contentDebt, curationIntegrity, upNext, readers, readership });
        },
    };
}
