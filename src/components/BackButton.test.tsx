import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import BackButton from './BackButton';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

describe('BackButton', () => {
  it('renders a back button', () => {
    render(
      <MemoryRouter>
        <BackButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  it('calls navigate(-1) when clicked', async () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BackButton />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('navigates to fallbackTo when history.length <= 1', async () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();

    const originalLength = window.history.length;
    Object.defineProperty(window, 'history', {
      value: { ...window.history, length: 1 },
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter>
        <BackButton fallbackTo="/" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(navigate).toHaveBeenCalledWith('/');

    Object.defineProperty(window, 'history', {
      value: { ...window.history, length: originalLength },
      writable: true,
      configurable: true,
    });
  });

  it('calls navigate(-1) when history.length > 1 even with fallbackTo', async () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();

    const originalLength = window.history.length;
    Object.defineProperty(window, 'history', {
      value: { ...window.history, length: 2 },
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter>
        <BackButton fallbackTo="/" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(navigate).toHaveBeenCalledWith(-1);

    Object.defineProperty(window, 'history', {
      value: { ...window.history, length: originalLength },
      writable: true,
      configurable: true,
    });
  });
});
