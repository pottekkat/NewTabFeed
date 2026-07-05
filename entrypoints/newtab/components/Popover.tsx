import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PopoverProps {
  /** Trigger element. Receives props to spread onto a button. */
  trigger: (props: {
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': true;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * A small anchored popover: toggled by its trigger, dismissed on outside click,
 * Escape, or when a child calls the provided `close`. Dependency-free
 * (@radix-ui/react-popover isn't vendored here).
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        'aria-haspopup': true,
      })}
      {open && (
        <div
          role="menu"
          className={cn(
            'bg-popover text-popover-foreground absolute top-full z-20 mt-1 min-w-48 overflow-hidden rounded-md border p-1 shadow-md',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}

/** A single row inside a Popover menu. */
export function MenuItem({ onSelect, children, className }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
        className,
      )}
    >
      {children}
    </button>
  );
}
