import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer/secondary content under the body. */
  footer?: ReactNode;
}

// Lightweight centered modal: backdrop click and Escape both dismiss. Rendered
// via a portal so it overlays the whole app regardless of where it's mounted.
export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-zmkay-edge bg-zmkay-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-zmkay-edge">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zmkay-muted hover:text-zmkay-text text-lg leading-none -mr-1 px-1"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-zmkay-edge text-xs text-zmkay-muted">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
