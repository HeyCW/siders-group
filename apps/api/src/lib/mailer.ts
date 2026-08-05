// Resend client for staff invites and password resets.
// Fleshed out by the auth/users follow-up change.

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export function sendEmail(_params: SendEmailParams): Promise<void> {
  throw new Error('sendEmail not yet implemented (see the auth/users follow-up change)');
}
