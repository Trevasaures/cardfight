import { createContext } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastOptions = {
  title?: string;
  duration?: number;
};

export type ToastContextValue = {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);
