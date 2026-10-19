import { cache } from 'react';
import { headers } from 'next/headers';
import { currentSession } from './session';
import { resolveLocale } from './locale';

export const currentLocale = cache(async () => {
  const session = await currentSession();
  return resolveLocale(session.user?.languagePreference, (await headers()).get('accept-language'));
});
