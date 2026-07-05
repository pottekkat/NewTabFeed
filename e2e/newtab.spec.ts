import { test, expect } from './fixtures';

test('the new tab override renders the wordmark and tagline', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  await expect(page.getByRole('heading', { name: 'NewTabFeed' })).toBeVisible();
  await expect(
    page.getByText('Your feeds. Your tab. Nothing else.'),
  ).toBeVisible();
});
