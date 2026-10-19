import jsQR from 'jsqr';
import { expect, type Page } from '@playwright/test';

/** Decode the rendered QR pixels, not an HTML attribute or the manual-key fallback. */
export async function setupSecretFromQr(page: Page): Promise<string> {
  const image = page.locator('img.mfa-qr');
  await expect(image).toBeVisible();
  const pixels = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0);
    return { data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height };
  });
  const result = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  expect(result, 'The rendered authenticator QR must be scannable').not.toBeNull();
  const provisioning = new URL(result!.data);
  expect(provisioning.protocol).toBe('otpauth:');
  expect(provisioning.host).toBe('totp');
  expect(provisioning.searchParams.get('secret')).toBeTruthy();
  return provisioning.searchParams.get('secret')!;
}
