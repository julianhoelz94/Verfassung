'use client';

import { createContext } from 'react';

/** Undefined means inline controls; null reserves a Wiki header slot until it mounts. */
export const ContentTranslationControlSlot = createContext<HTMLElement | null | undefined>(undefined);
