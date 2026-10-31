export async function openProfilePanel(page) {
  if (await page.locator('#profile-panel').isHidden()) {
    await page.locator('#profile-chip').click();
  }
}

export async function clickSetAction(set, label) {
  await set.locator('.set-action-trigger').click();
  await set.getByRole('button', { name: label, exact: true }).click();
}
