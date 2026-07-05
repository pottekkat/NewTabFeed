import * as React from 'react';

import { cn } from '@/lib/utils';

// A plain <label>. shadcn's default wraps @radix-ui/react-label, but a native
// label carries the same accessibility semantics and keeps our dependency
// surface minimal (only @radix-ui/react-slot is vendored in this project).
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // A reusable primitive: callers associate it with a control via `htmlFor` or
    // by nesting, so the association check can't apply here.
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
