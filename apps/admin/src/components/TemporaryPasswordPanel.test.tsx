import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemporaryPasswordPanel } from './TemporaryPasswordPanel.js';

afterEach(() => cleanup());

describe('TemporaryPasswordPanel', () => {
  it('shows the temporary password and the "will not be shown again" statement', () => {
    render(<TemporaryPasswordPanel accountLabel="New Editor" temporaryPassword="temp-pw-1" onDismiss={vi.fn()} />);

    expect(screen.getByText('temp-pw-1')).toBeTruthy();
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy();
  });

  it('copies the password to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<TemporaryPasswordPanel accountLabel="New Editor" temporaryPassword="temp-pw-1" onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('temp-pw-1');
  });

  // specs/staff-account-management/spec.md - "The temporary password is not retrievable later".
  it('calls onDismiss, after which nothing in this app can show the value again since it lived only in the parent\'s state', () => {
    const onDismiss = vi.fn();
    render(<TemporaryPasswordPanel accountLabel="New Editor" temporaryPassword="temp-pw-1" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
