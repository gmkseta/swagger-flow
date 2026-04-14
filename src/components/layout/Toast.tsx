import { useState, useEffect, useCallback } from 'preact/hooks';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

// --- Toast Types ---

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
  duration: number;
}

export interface ToastContext {
  toast: (type: ToastMessage['type'], message: string, duration?: number) => void;
  clearAll: () => void;
}

const ToastCtx = createContext<ToastContext>({
  toast: () => {},
  clearAll: () => {},
});

export function useToast(): ToastContext {
  return useContext(ToastCtx);
}

// --- Provider ---

let nextId = 0;

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback(
    (type: ToastMessage['type'], message: string, duration = 3500) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    [],
  );

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Clear toasts when the active Chrome tab changes
  useEffect(() => {
    const onTabActivated = () => setToasts([]);
    chrome.tabs?.onActivated?.addListener(onTabActivated);
    return () => {
      chrome.tabs?.onActivated?.removeListener(onTabActivated);
    };
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastCtx.Provider value={{ toast, clearAll }}>
      {children}

      {/* Toast Container — fixed at bottom, above tab bar */}
      {toasts.length > 0 && (
        <div class="fixed bottom-14 left-2 right-2 z-50 flex flex-col gap-1.5 pointer-events-none">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// --- Toast Item ---

function ToastItem({ toast: t, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setLeaving(true), t.duration - 300);
    const removeTimer = setTimeout(onDismiss, t.duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [t.duration, onDismiss]);

  const colors = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-indigo-600 text-white',
  };

  const icons = {
    success: '\u2713',
    error: '\u2717',
    info: '\u2139',
  };

  return (
    <div
      class={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium transition-all duration-300 ${colors[t.type]} ${
        leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <span class="text-sm font-bold shrink-0">{icons[t.type]}</span>
      <span class="flex-1 min-w-0">{t.message}</span>
      <button
        onClick={onDismiss}
        class="shrink-0 opacity-70 hover:opacity-100 text-sm leading-none"
      >
        &times;
      </button>
    </div>
  );
}
