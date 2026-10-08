import type { WikiImage } from '../../lib/api';

export function WikiImages({ images }: { images: WikiImage[] }) {
  if (images.length === 0) return null;
  return (
    <div className="wiki-images">
      {images.map((image) => (
        <figure key={`${image.documentId}-${image.revision}`}>
          {/* The document service verifies the published wiki link before returning image bytes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/document/documents/${encodeURIComponent(image.documentId)}/revisions/${image.revision}/file`}
            alt={image.alt}
            loading="lazy"
          />
          {image.caption || image.credit || image.sourceUrl || image.rights ? (
            <figcaption>
              {image.caption}
              {image.credit ? ` · ${image.credit}` : null}
              {image.rights ? ` · ${image.rights}` : null}
              {image.sourceUrl ? <> · <a href={image.sourceUrl}>Source</a></> : null}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
