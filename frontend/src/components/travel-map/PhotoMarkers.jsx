import React from 'react';
import { photoImageStyle } from '../../lib/photoImage';

function photoBackground(photo) {
  return photoImageStyle(photo, 'linear-gradient(180deg, transparent 52%, rgba(0, 0, 0, 0.3))');
}

function PhotoMarkersComponent({ place, visible, onPhotoSelect, shouldIgnoreClick }) {
  if (!visible || !place) return null;

  return (
    <g className="photo-marker-layer">
      {place.photos.map((photo, index) => {
        const [x, y] = photo.mapPoint;

        return (
          <foreignObject
            key={photo.id}
            x={x - 24}
            y={y - 32}
            width="62"
            height="76"
            className="photo-marker-object"
          >
            <button
              className={`photo-marker tone-${photo.tone}`}
              type="button"
              aria-label={`${photo.thaiTitle}, ${photo.takenAt}`}
              style={{ '--delay': `${index * 90}ms` }}
              onClick={(event) => {
                if (shouldIgnoreClick?.()) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }

                onPhotoSelect(photo);
              }}
            >
              <span className="photo-marker-image" style={photoBackground(photo)} />
            </button>
          </foreignObject>
        );
      })}
    </g>
  );
}

export const PhotoMarkers = React.memo(PhotoMarkersComponent);
