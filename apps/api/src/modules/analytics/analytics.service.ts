import type { DashboardResponse } from '@siders/contracts';
import type { AnalyticsRepository } from './analytics.repository.js';
import { toDashboardResponse } from './analytics.mapper.js';

export interface AnalyticsService {
  getDashboard(): Promise<DashboardResponse>;
}

export function createAnalyticsService(repository: AnalyticsRepository): AnalyticsService {
  return {
    async getDashboard() {
      // One `now` shared by every tile, so the six sections describe the same instant rather
      // than six slightly different ones from staggered repository calls.
      const now = new Date();
      const [pipeline, cadence, contentDebt, curationIntegrity, upNext, readers] = await Promise.all([
        repository.getPipelineCounts(),
        repository.getCadence(now),
        repository.getContentDebt(),
        repository.getCurationIntegrity(now),
        repository.getUpNext(now),
        repository.getReaderActivity(now),
      ]);
      return toDashboardResponse({ pipeline, cadence, contentDebt, curationIntegrity, upNext, readers });
    },
  };
}
