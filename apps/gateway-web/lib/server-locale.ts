import { cache } from 'react';
import { headers } from 'next/headers';
import { currentSession } from './session';
import { siteLanguages } from './deployment-setup';
import { resolveLocale } from './locale';

export const currentLocale = cache(async () => {
  const session = await currentSession();
  const policy = await siteLanguages();
  return resolveLocale(session.user?.languagePreference, (await headers()).get('accept-language'), policy.enabled, policy.defaultLanguage);
});
