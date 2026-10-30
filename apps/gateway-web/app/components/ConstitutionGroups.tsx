import { History } from 'lucide-react';
import type { ConstitutionSummary } from '../../lib/api';
import { groupConstitutions, type ConstitutionOwner } from '../../lib/country-directory';
import { directoryUi } from '../../lib/country-directory-messages';
import { ConstitutionEntry } from './ConstitutionEntry';
import { T } from './TranslationProvider';
import styles from './CountryDirectory.module.css';

export function ConstitutionGroups({ constitutions, owner, regional = false, headingLevel, editorial, publisher }: {
  constitutions: ConstitutionSummary[]; owner: ConstitutionOwner; regional?: boolean; headingLevel?: 3 | 4; editorial?: boolean; publisher?: boolean;
}) {
  const groups = groupConstitutions(constitutions);
  const entryLevel = headingLevel ?? (regional ? 4 : 3);
  const HistoricalHeading = entryLevel === 4 ? 'h4' : 'h3';
  return <>
    {groups.current.map(constitution => <ConstitutionEntry key={constitution.id} constitution={constitution} owner={owner} headingLevel={entryLevel} editorial={editorial} publisher={publisher} />)}
    {groups.historical.length ? <section id={regional ? `historical-${owner.jurisdictionId}` : 'historical-national'} aria-labelledby={regional ? `historical-${owner.jurisdictionId}-title` : 'historical-national-title'}>
      <HistoricalHeading className={styles.historicalTitle} id={regional ? `historical-${owner.jurisdictionId}-title` : 'historical-national-title'}><History aria-hidden="true" /><T value={regional ? directoryUi.historicalRegional : directoryUi.historicalNational} /> ({groups.historical.length}){regional ? <span className="sr-only"> · {owner.name}</span> : null}</HistoricalHeading>
      {groups.historical.map(constitution => <ConstitutionEntry key={constitution.id} constitution={constitution} owner={owner} headingLevel={entryLevel === 4 ? 5 : 4} editorial={editorial} publisher={publisher} />)}
    </section> : null}
  </>;
}
