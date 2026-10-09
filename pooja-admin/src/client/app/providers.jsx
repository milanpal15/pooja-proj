import { ConfirmProvider, ToastProvider } from '../ui/index.js';

/** App-wide providers: toasts, and the promise-style confirm dialog. */
export function Providers({ children }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
