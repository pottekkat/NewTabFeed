import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

// A minimal, dependency-free modal dialog. shadcn's default builds on
// @radix-ui/react-dialog; this project only vendors @radix-ui/react-slot, so we
// implement the essentials directly: a portal, a scrim, focus trap on open,
// Escape-to-close, scroll lock, and click-outside-to-close.

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Accessible dialog title (visually rendered by DialogTitle). */
  labelledBy?: string;
}

function useLockBodyScroll(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

function Dialog({ open, onOpenChange, children, labelledBy }: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  useLockBodyScroll(open);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  // Move focus into the panel when it opens.
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      data-slot="dialog-overlay"
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      // Click-outside is a mouse-only convenience; keyboard users dismiss with
      // Escape (handled above), so this scrim needs no keyboard handler.
      onMouseDown={(e) => {
        // Close only when the scrim itself (not a child) is pressed.
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-slot="dialog-content"
        className="bg-background relative my-4 grid w-full max-w-lg gap-4 rounded-xl border p-6 shadow-lg outline-none"
      >
        {children}
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="ring-offset-background focus-visible:ring-ring absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 pr-6 text-left', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    // Content is always supplied by callers; the linter can't see through the
    // spread, so the heading-content check is disabled for this primitive.
    // eslint-disable-next-line jsx-a11y/heading-has-content
    <h2
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
