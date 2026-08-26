import React from 'react';
import { photoImageStyle } from '../../lib/photoImage';

function photoBackground(photo) {
  return photoImageStyle(photo);
}

export function PhotoGallery({ photo, photos, onClose, onSelect }) {
  if (!photo) return null;

  const currentIndex = photos.findIndex((item) => item.id === photo.id);
  const previous = photos[(currentIndex - 1 + photos.length) % photos.length];
  const next = photos[(currentIndex + 1) % photos.length];

  return (
    <div className="photo-gallery" role="dialog" aria-modal="true" aria-label={photo.thaiTitle}>
      <button className="gallery-close" type="button" onClick={onClose} aria-label="ปิดแกลเลอรี">
        <span aria-hidden="true">&#10005;</span>
      </button>
      <button className="gallery-arrow gallery-arrow-left" type="button" onClick={() => onSelect(previous)} aria-label="รูปก่อนหน้า">
        <span aria-hidden="true">&#8592;</span>
      </button>
      <div className="gallery-content">
        <div className={`gallery-image tone-${photo.tone}`} style={photoBackground(photo)} />
        <p className="panel-kicker">{currentIndex + 1} / {photos.length}</p>
        <h2>{photo.thaiTitle}</h2>
        <p>{photo.takenAt}</p>
        <blockquote>{photo.caption}</blockquote>
      </div>
      <button className="gallery-arrow gallery-arrow-right" type="button" onClick={() => onSelect(next)} aria-label="รูปถัดไป">
        <span aria-hidden="true">&#8594;</span>
      </button>
    </div>
  );
}
