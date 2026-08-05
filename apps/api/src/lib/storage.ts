// S3-compatible client (Cloudflare R2) for presigned media uploads.
// Fleshed out by add-news-management-system task 7.6. This file establishes
// where the R2 client config lives so that change only adds behavior.

import type { Env } from '../config/env.js';

export type StorageEnv = Pick<
  Env,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET'
>;

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/**
 * Placeholder: throws until add-news-management-system wires the S3 SDK client.
 */
export function createPresignedUpload(
  _env: StorageEnv,
  _params: { mime: string; sizeBytes: number },
): Promise<PresignedUpload> {
  throw new Error('createPresignedUpload not yet implemented (see add-news-management-system)');
}
