'use client';

import { useState, type FormEvent } from 'react';
import { CONTACT_INFO } from '../../lib/content';

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

function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Required';
  if (!form.email.trim()) errors.email = 'Required';
  else if (!EMAIL_PATTERN.test(form.email)) errors.email = 'Enter a valid email';
  if (!form.message.trim()) errors.message = 'Required';
  return errors;
}

const inputClass =
  'w-full border-0 border-b-2 border-ink bg-transparent py-2 text-[15px] outline-none placeholder:text-muted';
const labelClass = 'block font-sans text-[11px] font-bold uppercase tracking-widest text-muted';

/**
 * No endpoint accepts a contact submission anywhere in this codebase
 * (`add-web-news-pages/proposal.md` — Non-Goals: "Contact form submission"). This validates for
 * real but never claims a successful send.
 */
export function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const errors = validate(form);

  function field(name: keyof FormState) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [name]: e.target.value })),
      onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, message: true });
    if (Object.keys(validate(form)).length > 0) return;
    setSubmitted(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[clamp(16px,2.5vw,24px)] pt-5">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input type="text" className={inputClass} {...field('name')} />
          {touched.name && errors.name && (
            <span className="mt-1 block text-xs text-red-700">{errors.name}</span>
          )}
        </label>
        <label className="block">
          <span className={labelClass}>Organisation</span>
          <input type="text" className={inputClass} {...field('organisation')} />
        </label>
        <label className="block">
          <span className={labelClass}>Email</span>
          <input type="email" className={inputClass} {...field('email')} />
          {touched.email && errors.email && (
            <span className="mt-1 block text-xs text-red-700">{errors.email}</span>
          )}
        </label>
        <label className="block">
          <span className={labelClass}>Subject</span>
          <input type="text" className={inputClass} {...field('subject')} />
        </label>
      </div>

      <label className="block pt-[clamp(16px,2.5vw,24px)]">
        <span className={labelClass}>Message</span>
        <textarea
          rows={6}
          className="mt-2 w-full resize-y border border-ink bg-white p-3 text-[15px] leading-[1.6] outline-none"
          {...field('message')}
        />
        {touched.message && errors.message && (
          <span className="mt-1 block text-xs text-red-700">{errors.message}</span>
        )}
      </label>

      <div className="pt-5">
        {submitted ? (
          <p className="max-w-[46ch] text-sm leading-[1.6] text-muted">
            Sending isn&rsquo;t wired up yet — email{' '}
            <a
              href={`mailto:${CONTACT_INFO.emails[0]}`}
              className="mark-hover text-ink underline"
            >
              {CONTACT_INFO.emails[0]}
            </a>{' '}
            directly and we&rsquo;ll get your message.
          </p>
        ) : (
          <button
            type="submit"
            className="inline-block bg-ink px-[22px] py-3.5 font-sans text-[11px] font-bold uppercase tracking-widest text-paper transition-colors duration-hover ease-hover hover:bg-black hover:text-signal focus-visible:bg-black focus-visible:text-signal"
          >
            Send message
          </button>
        )}
      </div>
    </form>
  );
}
