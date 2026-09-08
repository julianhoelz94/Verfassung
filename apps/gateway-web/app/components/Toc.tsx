'use client';

import { useEffect, useState } from 'react';

export type TocItem = {
  id: string;
  href: string;
  label: string;
};

export function Toc({
  items,
  ariaLabel = 'Table of contents',
  landmarkId,
}: {
  items: TocItem[];
  ariaLabel?: string;
  landmarkId?: string;
}) {
  const [current, setCurrent] = useState(items[0]?.id ?? '');
  const ids = items.map((item) => item.id).join('|');

  useEffect(() => {
    const nodes = items
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node != null);
    if (nodes.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id;
        if (id) {
          setCurrent(id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.25, 1] },
    );
    for (const node of nodes) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [ids, items]);

  return (
    <nav className="toc" aria-label={ariaLabel} id={landmarkId}>
      <h2>Contents</h2>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a href={item.href} aria-current={current === item.id ? 'true' : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
