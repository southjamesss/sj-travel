import React, { useEffect, useMemo } from 'react';
import { photoImageStyle } from '../../lib/photoImage';

function photoBackground(photo, overlay = '') {
  return photoImageStyle(photo, overlay);
}

function buildGalleryPhotos(photo, photos) {
  if (!photo) return [];
  if (!photos?.length) return [photo];
  if (photos.some((item) => item.id === photo.id)) return photos;
  return [photo, ...photos];
}

function formatCoordinates(photo) {
  if (!Number.isFinite(photo?.latitude) || !Number.isFinite(photo?.longitude)) return null;
  return `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}`;
}

export function PhotoGallery({ photo, photos, onClose, onSelect }) {
  const galleryPhotos = useMemo(() => buildGalleryPhotos(photo, photos), [photo, photos]);
  const currentIndex = useMemo(
    () => galleryPhotos.findIndex((item) => item.id === photo?.id),
    [galleryPhotos, photo],
  );
  const activePhoto = galleryPhotos[currentIndex] ?? galleryPhotos[0] ?? null;

  const previous = activePhoto && galleryPhotos.length > 1
    ? galleryPhotos[(currentIndex - 1 + galleryPhotos.length) % galleryPhotos.length]
    : activePhoto;
  const next = activePhoto && galleryPhotos.length > 1
    ? galleryPhotos[(currentIndex + 1) % galleryPhotos.length]
    : activePhoto;
  const coordinates = formatCoordinates(activePhoto);

  useEffect(() => {
    if (!activePhoto) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (galleryPhotos.length <= 1) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onSelect(previous);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onSelect(next);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePhoto, galleryPhotos.length, next, onClose, onSelect, previous]);

  if (!activePhoto) return null;

  return (
    <div className="photo-gallery" role="dialog" aria-modal="true" aria-label={activePhoto.thaiTitle}>
      <button className="gallery-backdrop" type="button" onClick={onClose} aria-label="ปิดแกลเลอรี" />
      <section className="gallery-shell">
        <div className={`gallery-ambient tone-${activePhoto.tone}`} style={photoBackground(activePhoto)} />
        <button className="gallery-close" type="button" onClick={onClose} aria-label="ปิดแกลเลอรี">
          <span aria-hidden="true">&#10005;</span>
        </button>
        <button
          className="gallery-arrow gallery-arrow-left"
          type="button"
          onClick={() => onSelect(previous)}
          aria-label="รูปก่อนหน้า"
          disabled={galleryPhotos.length <= 1}
        >
          <span aria-hidden="true">&#8592;</span>
        </button>
        <div className="gallery-content">
          <div className="gallery-stage-copy">
            <p className="panel-kicker">มุมมองรูปภาพ</p>
            <div className="gallery-count-row">
              <span className="gallery-count-pill">{currentIndex + 1} / {galleryPhotos.length}</span>
              <span className="gallery-shortcut">Esc ปิด · ← → เลื่อน</span>
            </div>
            <h2>{activePhoto.thaiTitle}</h2>
            <p className="gallery-date">{activePhoto.takenAt}</p>
            <blockquote>{activePhoto.caption}</blockquote>
            <div className="gallery-meta">
              {activePhoto.title && <span>{activePhoto.title}</span>}
              {coordinates && <span>{coordinates}</span>}
            </div>
          </div>
          <div className="gallery-frame-column">
            <div className={`gallery-frame tone-${activePhoto.tone}`}>
              <div
                className={`gallery-image tone-${activePhoto.tone}`}
                style={photoBackground(
                  activePhoto,
                  'linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 24%), linear-gradient(180deg, transparent 44%, rgba(0, 0, 0, 0.52))',
                )}
              />
            </div>
            {galleryPhotos.length > 1 && (
              <div className="gallery-filmstrip" aria-label="เลือกรูป">
                {galleryPhotos.map((item, index) => (
                  <button
                    key={item.id}
                    className={`gallery-thumb tone-${item.tone} ${item.id === activePhoto.id ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => onSelect(item)}
                    aria-label={`เปิดรูป ${index + 1}`}
                  >
                    <span className="gallery-thumb-image" style={photoBackground(item)} />
                    <span className="gallery-thumb-index">{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          className="gallery-arrow gallery-arrow-right"
          type="button"
          onClick={() => onSelect(next)}
          aria-label="รูปถัดไป"
          disabled={galleryPhotos.length <= 1}
        >
          <span aria-hidden="true">&#8594;</span>
        </button>
      </section>
    </div>
  );
}
