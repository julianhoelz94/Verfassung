'use client';

import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { safeSearchHref } from '../../lib/search-workspace';
import { searchWorkspaceUi } from '../../lib/search-workspace-messages';
import { useTranslation } from './TranslationProvider';
import { PageBreadcrumbs } from './layout/PageChrome';
import styles from '../search/SearchWorkspace.module.css';

/** Shared by country, regional and individual-passage readers; only Search is a valid return. */
export function SearchReturnLink() {
  const href = safeSearchHref(useSearchParams()?.get('fromSearch')), t = useTranslation();
  return href ? <PageBreadcrumbs><a className={styles.returnLink} href={href}><ArrowLeft size={16} aria-hidden="true" />{t(searchWorkspaceUi.back)}</a></PageBreadcrumbs> : null;
}
