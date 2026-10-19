import { cookies } from 'next/headers';
import { translationAvailability, translationUserSettings } from '../../lib/content-translation';
import { SESSION_COOKIE } from '../../lib/session';
import { ContentTranslation } from './ContentTranslation';
import type { ReactNode } from 'react';

export async function ContentTranslationRegion({ children, sourceLanguage }: { children: ReactNode; sourceLanguage: string }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const [availability, userSettings] = await Promise.all([
    translationAvailability().catch(() => ({ enabled: false })),
    token ? translationUserSettings(token).catch(() => null) : Promise.resolve(null),
  ]);
  return <ContentTranslation
    sourceLanguage={sourceLanguage}
    authenticated={Boolean(token && userSettings)}
    enabled={availability.enabled}
    alwaysTranslate={userSettings?.alwaysTranslate ?? false}
  >{children}</ContentTranslation>;
}
