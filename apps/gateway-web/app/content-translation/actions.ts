'use server';

import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../lib/session';
import { translateContentBatch } from '../../lib/content-translation';

export async function translateContentAction(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<string[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('Login required');
  const result = await translateContentBatch(token, texts, sourceLanguage, targetLanguage);
  if (!Array.isArray(result.texts) || result.texts.length !== texts.length ||
    result.texts.some(text => typeof text !== 'string')) {
    throw new Error('The translation response did not match the requested passages');
  }
  return result.texts;
}
