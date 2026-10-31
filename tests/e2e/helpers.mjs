export async function clickSetAction(set, label) {
  await set.locator('.set-action-trigger').click();
  await set.getByRole('button', { name: label, exact: true }).click();
}
