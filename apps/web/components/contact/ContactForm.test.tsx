import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContactForm } from './ContactForm.js';

afterEach(cleanup);

describe('ContactForm', () => {
  it('blocks submission and shows an error when required fields are blank', () => {
    render(<ContactForm />);
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(screen.queryByText(/wired up yet/i)).not.toBeInTheDocument();
  });

  it('blocks submission and shows an error for a malformed email', () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rina' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Halo redaksi' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.queryByText(/wired up yet/i)).not.toBeInTheDocument();
  });

  it('shows the honest not-wired-up state once all required fields are valid', () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rina' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rina@example.com' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Halo redaksi' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByText(/wired up yet/i)).toBeInTheDocument();
  });
});
