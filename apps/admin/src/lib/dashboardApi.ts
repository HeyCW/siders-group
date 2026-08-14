import type { DashboardResponse } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const dashboardApi = {
  get(): Promise<DashboardResponse> {
    return apiFetch<Envelope<DashboardResponse>>('/admin/dashboard').then((r) => r.data);
  },
};
