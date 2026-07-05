import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title, description and an optional action', async () => {
    const screen = await render(
      <EmptyState
        icon={Inbox}
        title="All caught up"
        description="You've read everything in this view."
        action={<Button>Add feeds</Button>}
      />,
    );

    await expect
      .element(screen.getByRole('heading', { name: 'All caught up' }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("You've read everything in this view."))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Add feeds' }))
      .toBeInTheDocument();
  });

  it('renders without an action', async () => {
    const screen = await render(
      <EmptyState
        icon={Inbox}
        title="No feeds yet"
        description="Add a feed to get started."
      />,
    );

    await expect
      .element(screen.getByRole('heading', { name: 'No feeds yet' }))
      .toBeInTheDocument();
    expect(screen.container.querySelector('button')).toBeNull();
  });
});
