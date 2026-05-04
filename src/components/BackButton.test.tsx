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
});
