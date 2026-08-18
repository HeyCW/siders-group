import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactForm } from './ContactForm.js';

const submitContactMessageMock = vi.fn();
vi.mock('../../lib/api.js', () => ({
  submitContactMessage: (...args: unknown[]) => submitContactMessageMock(...args),
}));

afterEach(() => {
  cleanup();
  submitContactMessageMock.mockReset();
});

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rina' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rina@example.com' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Halo redaksi' } });
}

describe('ContactForm', () => {
  it('blocks submission and shows an error when required fields are blank', () => {
    render(<ContactForm />);
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(submitContactMessageMock).not.toHaveBeenCalled();
  });

  it('blocks submission and shows an error for a message over the server\'s length cap', () => {
    render(<ContactForm />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'a'.repeat(5001) } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByText(/keep it under 5000 characters/i)).toBeInTheDocument();
    expect(submitContactMessageMock).not.toHaveBeenCalled();
  });

  it('blocks submission and shows an error for a malformed email', () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rina' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Halo redaksi' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(submitContactMessageMock).not.toHaveBeenCalled();
  });

  it('submits the trimmed fields once required fields are valid, omitting blank optional fields', async () => {
    submitContactMessageMock.mockResolvedValueOnce({ id: 'msg-1', createdAt: '2026-01-01T00:00:00.000Z' });
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(submitContactMessageMock).toHaveBeenCalledTimes(1));
    expect(submitContactMessageMock).toHaveBeenCalledWith({
      name: 'Rina',
      organisation: undefined,
      email: 'rina@example.com',
      subject: undefined,
      message: 'Halo redaksi',
    });
  });

  it('shows a genuine success message once the submission succeeds', async () => {
    submitContactMessageMock.mockResolvedValueOnce({ id: 'msg-1', createdAt: '2026-01-01T00:00:00.000Z' });
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/message received/i)).toBeInTheDocument();
  });

  it('reports failure and preserves the visitor input when the request fails', async () => {
    submitContactMessageMock.mockRejectedValueOnce(new Error('network error'));
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/sending failed/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Rina');
    expect(screen.getByLabelText('Message')).toHaveValue('Halo redaksi');
    expect(screen.queryByText(/message received/i)).not.toBeInTheDocument();
  });
});
