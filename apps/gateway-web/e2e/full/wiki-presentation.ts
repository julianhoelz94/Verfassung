import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

// Only documentation contexts get these decorations and viewing delays.
export async function installPresentation(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem('ca_cookie_notice_v1', 'dismissed');
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `
        input[type=password], input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i] { filter:blur(12px) !important; }
        #wiki-pointer { position:fixed; top:0; left:0; width:26px; height:32px; z-index:2147483647; pointer-events:none; transition:transform 650ms ease-in-out; filter:drop-shadow(1px 2px 2px #0008); }
        #wiki-pointer svg { display:block; width:100%; height:100%; }
        #wiki-pointer.down { filter:drop-shadow(0 0 9px #f59e0b); }
        #wiki-target { position:fixed; pointer-events:none; z-index:2147483645; outline:3px solid #d97706; outline-offset:5px; border-radius:5px; background:#f59e0b12; }
        #wiki-caption { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); max-width:85vw; width:max-content; box-sizing:border-box; padding:14px 22px; border-radius:10px; background:#122c30f5; color:white; font:600 19px/1.45 system-ui; z-index:2147483646; box-shadow:0 4px 20px #0004; pointer-events:none; text-align:center; }
      `;
      document.head.append(style);
      const pointer = document.createElement('div');
      pointer.id = 'wiki-pointer'; pointer.dataset.wikiDecoration = '';
      pointer.setAttribute('aria-hidden', 'true');
      pointer.innerHTML = '<svg viewBox="0 0 26 32"><path d="M2 2 L2 26 L9 20 L14 30 L19 27 L14 18 L24 17 Z" fill="white" stroke="#172b4d" stroke-width="2"/></svg>';
      pointer.style.transform = sessionStorage.getItem('wiki-pointer-position') ?? 'translate(36px,100px)';
      document.body.append(pointer);
      document.addEventListener('mousemove', (event) => { pointer.style.transform = `translate(${event.clientX}px,${event.clientY}px)`; sessionStorage.setItem('wiki-pointer-position', pointer.style.transform); });
      document.addEventListener('mousedown', () => pointer.classList.add('down'));
      document.addEventListener('mouseup', () => setTimeout(() => pointer.classList.remove('down'), 500));
    }, { once: true });
  });
}

export class Walkthrough {
  constructor(readonly page: Page) {}

  private async pause(milliseconds: number) {
    if (process.env.WIKI_MEDIA_CAPTURE === 'merged') await this.page.waitForTimeout(milliseconds);
  }

  async explain(text: string) {
    await this.page.evaluate((value) => {
      let caption = document.getElementById('wiki-caption');
      if (!caption) {
        caption = document.createElement('div');
        caption.id = 'wiki-caption'; caption.dataset.wikiDecoration = '';
        document.body.append(caption);
      }
      caption.textContent = value; caption.style.top = ''; caption.style.bottom = '18px';
    }, text);
    // Deliberate viewing time after assertions, not a readiness wait.
    await this.pause(Math.max(4000, text.length * 65));
  }

  async point(target: Locator) {
    await expect(target).toBeVisible();
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error('Recording target has no visible bounds');
    await this.page.evaluate((rect) => {
      document.getElementById('wiki-target')?.remove();
      const caption = document.getElementById('wiki-caption');
      if (caption && rect.y + rect.height > innerHeight - 140) { caption.style.bottom = 'auto'; caption.style.top = '18px'; }
      const marker = document.createElement('div');
      marker.id = 'wiki-target'; marker.dataset.wikiDecoration = '';
      Object.assign(marker.style, { left:`${rect.x}px`, top:`${rect.y}px`, width:`${rect.width}px`, height:`${rect.height}px` });
      document.body.append(marker);
    }, box);
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.pause(1100);
  }

  async click(target: Locator) {
    await this.point(target);
    await target.click({ delay:180 });
    await this.page.evaluate(() => document.getElementById('wiki-target')?.remove());
    await this.pause(1500);
  }

  async type(target: Locator, text: string) {
    await this.click(target);
    await target.fill('');
    await target.pressSequentially(text, { delay:process.env.WIKI_MEDIA_CAPTURE === 'merged' ? 65 : 0 });
    await this.pause(1000);
  }
}

export async function illustrate(page: Page, path: string, target?: Locator) {
  if (target) { await target.scrollIntoViewIfNeeded(); await expect(target).toBeVisible(); }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path, animations:'disabled', style:'[data-wiki-decoration] { visibility:hidden !important; }' });
}
