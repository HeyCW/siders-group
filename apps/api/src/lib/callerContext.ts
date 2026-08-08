/** The authenticated staff caller's identity plus the one authorization fact every
 *  Owner-gated operation needs — populated onto `req.staffRole` by `requirePermission`. */
export interface CallerContext {
  subjectId: string;
  isOwner: boolean;
}
