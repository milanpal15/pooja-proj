import { createContext, useCallback, useContext, useRef, useState } from 'react';

import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';

/**
 * A choice with a consequence. Names the object and the effect; the confirm
 * button carries a verb ("Delete pack"), never "OK". `tone="danger"` for
 * anything destructive.
 *
 * Controlled:   <ConfirmDialog open title message confirmLabel tone onConfirm onCancel />
 * Promise-style: const confirm = useConfirm(); if (await confirm({ ... })) { ... }
 *
 * @typedef {Object} ConfirmOptions
 * @property {string} title
 * @property {React.ReactNode} [message]
 * @property {string} [confirmLabel='Confirm']
 * @property {string} [cancelLabel='Cancel']
 * @property {'default'|'danger'} [tone='default']
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      top
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }>
      {message && <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message}</div>}
    </Modal>
  );
}

const ConfirmContext = createContext(null);

/** Mount once near the root; `useConfirm()` then works anywhere below it. */
export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setOpts(options);
      }),
    [],
  );

  const settle = (answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!opts}
        {...(opts || { title: '' })}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/** @returns {(options: ConfirmOptions) => Promise<boolean>} */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm needs <ConfirmProvider>');
  return confirm;
}
