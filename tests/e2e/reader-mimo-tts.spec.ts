import { test, expect } from '@playwright/test'
import { gotoApp } from './support/app'

test.skip(
  !process.env.E2E_MIMO_BOOK_NAME,
  'Set E2E_MIMO_BOOK_NAME (and seed a MiMo server speech config) to enable this regression.',
)

test('reader TTS panel exposes and switches to the server MiMo engine', async ({ page }) => {
  await page.addInitScript((accessToken) => {
    if (accessToken) localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('reader-speechConfig', JSON.stringify({ provider: 'openai' }))
  }, process.env.E2E_ACCESS_TOKEN || '')

  await gotoApp(page, '/')
  await page.locator('.book-card').filter({ hasText: process.env.E2E_MIMO_BOOK_NAME! }).click()
  await expect(page).toHaveURL(/#\/reader/)

  await page.getByTitle('听书').click()
  const panel = page.locator('.tts-controls')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: '后端配置 (小米 MiMo)' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '小米 MiMo', exact: true })).toBeVisible()

  await panel.getByRole('button', { name: '后端配置 (小米 MiMo)' }).click()
  await expect(panel.getByText(/小米 MiMo 使用后端配置 · mimo-v2\.5-tts \/ 冰糖/)).toBeVisible()
})
