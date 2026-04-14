/** @jsxImportSource preact */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/preact';

// --- Mocks (must be declared before importing the hook) ---

vi.mock('../utils/messaging', () => ({
  sendMessage: vi.fn(),
}));

let ready = false;
vi.mock('../utils/crypto', () => ({
  initEncryptionKey: vi.fn(async (_k: string) => {
    ready = true;
  }),
  clearEncryptionKey: vi.fn(() => {
    ready = false;
  }),
  isEncryptionReady: vi.fn(() => ready),
}));

vi.mock('#auth-provider', () => ({
  provider: {
    type: 'test',
    requiresLogin: true,
    checkLogin: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getCachedUser: vi.fn(),
  },
}));

import { useAuthProvider } from './useAuthProvider';
import { sendMessage } from '../utils/messaging';
import { initEncryptionKey, clearEncryptionKey } from '../utils/crypto';

const sendMessageMock = sendMessage as unknown as ReturnType<typeof vi.fn>;

function Probe() {
  const s = useAuthProvider();
  return (
    <div>
      <span data-testid="user">{s.user ? s.user.userId : 'none'}</span>
      <span data-testid="loading">{String(s.loading)}</span>
      <span data-testid="encrypted">{String(s.encrypted)}</span>
      <span data-testid="pending">{String(s.pending)}</span>
      <span data-testid="error">{s.error ?? ''}</span>
      <span data-testid="requires">{String(s.requiresLogin)}</span>
      <button data-testid="login" onClick={() => s.login()}>login</button>
      <button data-testid="logout" onClick={() => s.logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  ready = false;
  sendMessageMock.mockReset();
  (initEncryptionKey as any).mockClear();
  (clearEncryptionKey as any).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAuthProvider', () => {
  it('initial checkStatus: logged-in user with encryptionKey triggers initEncryptionKey', async () => {
    sendMessageMock.mockResolvedValueOnce({
      user: { userId: 'u1', encryptionKey: 'k' },
      encrypted: true,
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));
    expect(screen.getByTestId('encrypted').textContent).toBe('true');
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(initEncryptionKey).toHaveBeenCalledWith('k');
  });

  it('initial checkStatus: logged-in user without encryptionKey does NOT derive key', async () => {
    sendMessageMock.mockResolvedValueOnce({
      user: { userId: 'u2' },
      encrypted: false,
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u2'));
    expect(screen.getByTestId('encrypted').textContent).toBe('false');
    expect(initEncryptionKey).not.toHaveBeenCalled();
  });

  it('initial checkStatus: no user → loading=false, user=none', async () => {
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('initial checkStatus: thrown error → loading=false, pending stays false (initial)', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('boom'));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('pending').textContent).toBe('false');
  });

  it('login: success with encryptionKey sets encrypted=true', async () => {
    // initial
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    // login response
    sendMessageMock.mockResolvedValueOnce({
      user: { userId: 'u1', encryptionKey: 'k' },
      encrypted: true,
      pending: false,
    });
    await act(async () => {
      screen.getByTestId('login').click();
    });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));
    expect(screen.getByTestId('encrypted').textContent).toBe('true');
    expect(initEncryptionKey).toHaveBeenCalledWith('k');
  });

  it('login: pending=true kicks off polling which eventually resolves', async () => {
    vi.useFakeTimers();
    // initial checkStatus → no user
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    // login → pending
    sendMessageMock.mockResolvedValueOnce({ user: null, pending: true });
    // next poll → still none
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    // subsequent poll → logged in
    sendMessageMock.mockResolvedValueOnce({
      user: { userId: 'u1', encryptionKey: 'k' },
      encrypted: true,
    });

    await act(async () => {
      screen.getByTestId('login').click();
    });
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('true'));

    // advance 2s → first poll (still no user, stays pending)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('pending').textContent).toBe('true');

    // advance another 2s → second poll completes login
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));
    expect(screen.getByTestId('pending').textContent).toBe('false');
  });

  it('login: server error sets error state and clears loading', async () => {
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    sendMessageMock.mockResolvedValueOnce({
      user: null,
      encrypted: false,
      error: 'oops',
    });
    await act(async () => {
      screen.getByTestId('login').click();
    });

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('oops'));
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('login: thrown rejection sets generic error', async () => {
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    sendMessageMock.mockRejectedValueOnce(new Error('down'));
    await act(async () => {
      screen.getByTestId('login').click();
    });

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('down'));
  });

  it('logout: clears user and calls clearEncryptionKey', async () => {
    sendMessageMock.mockResolvedValueOnce({
      user: { userId: 'u1', encryptionKey: 'k' },
      encrypted: true,
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));

    sendMessageMock.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      screen.getByTestId('logout').click();
    });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(screen.getByTestId('encrypted').textContent).toBe('false');
    expect(clearEncryptionKey).toHaveBeenCalled();
  });

  it('logout: error keeps loading=false', async () => {
    sendMessageMock.mockResolvedValueOnce({
      user: { userId: 'u1' },
      encrypted: false,
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('u1'));

    sendMessageMock.mockRejectedValueOnce(new Error('x'));
    await act(async () => {
      screen.getByTestId('logout').click();
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
  });

  it('exposes requiresLogin from provider', async () => {
    sendMessageMock.mockResolvedValueOnce({ user: null, encrypted: false });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('requires').textContent).toBe('true'));
  });
});
