import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

import {
  ToastContext,
  type ToastOptions,
  type ToastTone,
} from "./toastContext";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
};

const TOAST_STYLE: Record<
  ToastTone,
  { icon: typeof CheckCircle2; title: string; className: string; iconClassName: string }
> = {
  success: {
    icon: CheckCircle2,
    title: "Action completed",
    className: "border-emerald-300/25 bg-emerald-950/95",
    iconClassName: "text-emerald-300",
  },
  error: {
    icon: CircleAlert,
    title: "Action failed",
    className: "border-rose-300/25 bg-rose-950/95",
    iconClassName: "text-rose-300",
  },
  info: {
    icon: Info,
    title: "Heads up",
    className: "border-cyan-300/25 bg-slate-950/95",
    iconClassName: "text-cyan-300",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string, options?: ToastOptions) => {
      const id = `toast-${Date.now()}-${nextId.current++}`;
      const style = TOAST_STYLE[tone];
      const duration = options?.duration ?? (tone === "error" ? 8000 : 5000);

      setToasts((current) => [
        ...current.slice(-3),
        {
          id,
          tone,
          title: options?.title ?? style.title,
          message,
        },
      ]);

      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      success: (message: string, options?: ToastOptions) =>
        show("success", message, options),
      error: (message: string, options?: ToastOptions) =>
        show("error", message, options),
      info: (message: string, options?: ToastOptions) =>
        show("info", message, options),
      dismiss,
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 sm:bottom-6 sm:right-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => {
          const style = TOAST_STYLE[toast.tone];
          const Icon = style.icon;

          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={`toast-enter pointer-events-auto rounded-2xl border p-4 shadow-2xl shadow-black/50 backdrop-blur-xl ${style.className}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClassName}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-50">
                    {toast.title}
                  </p>
                  <p className="mt-1 break-words text-sm leading-5 text-slate-300">
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-100"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
