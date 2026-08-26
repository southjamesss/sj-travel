import React from 'react';

function PlaceMarkersComponent({ places, selectedPlaceId, visible, onPlaceSelect, shouldIgnoreClick }) {
  if (!visible) return null;

  return (
    <g className="place-marker-layer">
      {places.map((place) => {
        const [x, y] = place.mapPoint;
        const selected = selectedPlaceId === place.id;

        return (
          <g
            key={place.id}
            className={`place-marker ${selected ? 'is-selected' : ''}`}
            transform={`translate(${x} ${y})`}
            role="button"
            tabIndex="0"
            aria-label={`${place.thaiName}, ${place.photoCount} รูป`}
            onClick={(event) => {
              event.stopPropagation();
              if (shouldIgnoreClick?.()) {
                event.preventDefault();
                return;
              }

              onPlaceSelect(place);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPlaceSelect(place);
              }
            }}
          >
            <circle className="place-marker-pulse" r="18" />
            <circle className="place-marker-dot" r="6" />
            <text x="15" y="-10">{place.thaiName}</text>
          </g>
        );
      })}
    </g>
  );
}

export const PlaceMarkers = React.memo(PlaceMarkersComponent);
