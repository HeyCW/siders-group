import { useState, type FormEvent } from 'react';
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_ORGANISATION_MAX_LENGTH,
  CONTACT_SUBJECT_MAX_LENGTH,
} from '@siders/contracts';
import { CONTACT_INFO } from '../../lib/content';
import { submitContactMessage } from '../../lib/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  name: string;
  organisation: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY: FormState = { name: '', organisation: '', email: '', subject: '', message: '' };

type Errors = Partial<Record<keyof FormState, string>>;

/**
 * Mirrors `contactMessageSubmitRequestSchema` (`@siders/contracts`) field-for-field, including its
 * length caps, so an over-long submission is caught here rather than round-tripping to a 400 the
 * visitor can't act on.
 */
function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Required';
  else if (form.name.trim().length > CONTACT_NAME_MAX_LENGTH) errors.name = `Keep it under ${CONTACT_NAME_MAX_LENGTH} characters`;
  if (form.organisation.trim().length > CONTACT_ORGANISATION_MAX_LENGTH) {
    errors.organisation = `Keep it under ${CONTACT_ORGANISATION_MAX_LENGTH} characters`;
  }
  if (!form.email.trim()) errors.email = 'Required';
  else if (!EMAIL_PATTERN.test(form.email)) errors.email = 'Enter a valid email';
  else if (form.email.trim().length > CONTACT_EMAIL_MAX_LENGTH) errors.email = `Keep it under ${CONTACT_EMAIL_MAX_LENGTH} characters`;
  if (form.subject.trim().length > CONTACT_SUBJECT_MAX_LENGTH) errors.subject = `Keep it under ${CONTACT_SUBJECT_MAX_LENGTH} characters`;
  if (!form.message.trim()) errors.message = 'Required';
  else if (form.message.trim().length > CONTACT_MESSAGE_MAX_LENGTH) errors.message = `Keep it under ${CONTACT_MESSAGE_MAX_LENGTH} characters`;
  return errors;
}

const inputClass =
  'w-full border-0 border-b-2 border-ink bg-transparent py-2 text-[15px] outline-none placeholder:text-muted';
const labelClass = 'block font-sans text-[11px] font-bold uppercase tracking-widest text-muted';

type SubmitStatus = 'idle' | 'submitting' | 'sent' | 'failed';

/**
 * Submits to the contact-message intake endpoint and reports the genuine outcome
 * (specs/web-public-site/spec.md - "Contact form validates client-side and submits to a real
 * endpoint"). A failed request leaves the form's contents in place — nothing the visitor typed
 * is discarded — so a retry doesn't mean retyping everything.
 */
export function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const errors = validate(form);

  function field(name: keyof FormState) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [name]: e.target.value })),
      onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, message: true });
    if (Object.keys(validate(form)).length > 0) return;

    setStatus('submitting');
    try {
      await submitContactMessage({
        name: form.name.trim(),
        organisation: form.organisation.trim() || undefined,
        email: form.email.trim(),
        subject: form.subject.trim() || undefined,
        message: form.message.trim(),
      });
      setStatus('sent');
    } catch {
      // Network error, server error, or a 429 rate limit all read the same to the visitor —
      // there is no action that differs by cause (specs/web-public-site/spec.md - "Submission
      // fails").
      setStatus('failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[clamp(16px,2.5vw,24px)] pt-5">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input type="text" maxLength={CONTACT_NAME_MAX_LENGTH} className={inputClass} {...field('name')} />
          {touched.name && errors.name && (
            <span className="mt-1 block text-xs text-red-700">{errors.name}</span>
          )}
        </label>
        <label className="block">
          <span className={labelClass}>Organization</span>
          <input type="text" maxLength={CONTACT_ORGANISATION_MAX_LENGTH} className={inputClass} {...field('organisation')} />
          {touched.organisation && errors.organisation && (
            <span className="mt-1 block text-xs text-red-700">{errors.organisation}</span>
          )}
        </label>
        <label className="block">
          <span className={labelClass}>Email</span>
          <input type="email" maxLength={CONTACT_EMAIL_MAX_LENGTH} className={inputClass} {...field('email')} />
          {touched.email && errors.email && (
            <span className="mt-1 block text-xs text-red-700">{errors.email}</span>
          )}
        </label>
        <label className="block">
          <span className={labelClass}>Subject</span>
          <input type="text" maxLength={CONTACT_SUBJECT_MAX_LENGTH} className={inputClass} {...field('subject')} />
          {touched.subject && errors.subject && (
            <span className="mt-1 block text-xs text-red-700">{errors.subject}</span>
          )}
        </label>
      </div>

      <label className="block pt-[clamp(16px,2.5vw,24px)]">
        <span className={labelClass}>Message</span>
        <textarea
          rows={6}
          maxLength={CONTACT_MESSAGE_MAX_LENGTH}
          className="mt-2 w-full resize-y border border-ink bg-white p-3 text-[15px] leading-[1.6] outline-none"
          {...field('message')}
        />
        {touched.message && errors.message && (
          <span className="mt-1 block text-xs text-red-700">{errors.message}</span>
        )}
      </label>

      <div className="pt-5">
        {status === 'sent' ? (
          <p className="max-w-[46ch] text-sm leading-[1.6] text-muted">
            Message received — we&rsquo;ll get back to you soon.
          </p>
        ) : (
          <>
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="inline-block bg-ink px-[22px] py-3.5 font-sans text-[11px] font-bold uppercase tracking-widest text-paper transition-colors duration-hover ease-hover hover:bg-black hover:text-signal focus-visible:bg-black focus-visible:text-signal disabled:opacity-50"
            >
              {status === 'submitting' ? 'Sending…' : 'Send message'}
            </button>
            {status === 'failed' && (
              <p className="mt-3 max-w-[46ch] text-sm leading-[1.6] text-muted">
                Sending failed — try again, or email{' '}
                <a
                  href={`mailto:${CONTACT_INFO.emails[0]}`}
                  className="mark-hover text-ink underline"
                >
                  {CONTACT_INFO.emails[0]}
                </a>{' '}
                directly.
              </p>
            )}
          </>
        )}
      </div>
    </form>
  );
}
