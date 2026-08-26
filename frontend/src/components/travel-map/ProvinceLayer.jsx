import React, { useMemo } from 'react';
import { polygonToPath } from '../../lib/mapGeometry';

function getClassName(feature, selectedProvinceCode, baseClass = 'province-shape') {
  const classes = [baseClass];
  if (feature.properties.visited) classes.push('is-visited');
  if (feature.properties.favorite) classes.push('is-favorite');
  if (feature.properties.code === selectedProvinceCode) classes.push('is-selected');
  return classes.join(' ');
}

function ProvinceLayerComponent({
  features,
  selectedProvinceCode,
  onProvinceSelect,
  onProvinceHover,
  onProvinceLeave,
  shouldIgnoreClick,
}) {
  const provincePaths = useMemo(
    () => features.map((feature) => ({
      feature,
      path: polygonToPath(feature.geometry),
    })),
    [features],
  );
  const atlasPath = useMemo(
    () => provincePaths.map(({ path }) => path).join(' '),
    [provincePaths],
  );
  const selectedPath = useMemo(
    () => provincePaths.find(({ feature }) => feature.properties.code === selectedProvinceCode)?.path ?? '',
    [provincePaths, selectedProvinceCode],
  );

  return (
    <g className="province-layer">
      <g className="province-depth-layer" aria-hidden="true" pointerEvents="none">
        <path className="province-depth-shape" d={atlasPath} pointerEvents="none" />
      </g>
      {provincePaths.map(({ feature, path }) => (
        <path
          key={feature.properties.code}
          className={getClassName(feature, selectedProvinceCode)}
          d={path}
          role="button"
          tabIndex="0"
          aria-label={`${feature.properties.thaiName}, ${feature.properties.trips} ทริป, ${feature.properties.photos} รูป`}
          onClick={(event) => {
            if (shouldIgnoreClick?.()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }

            onProvinceSelect(feature);
          }}
          onFocus={(event) => onProvinceHover(feature, event)}
          onMouseEnter={(event) => onProvinceHover(feature, event)}
          onMouseMove={(event) => onProvinceHover(feature, event)}
          onBlur={onProvinceLeave}
          onMouseLeave={onProvinceLeave}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onProvinceSelect(feature);
            }
          }}
        >
          <title>
            {feature.properties.thaiName} - {feature.properties.trips} ทริป - {feature.properties.photos} รูป
          </title>
        </path>
      ))}
      <g className="province-topography-layer" aria-hidden="true" pointerEvents="none">
        <path className="province-topography-shape" d={atlasPath} pointerEvents="none" />
        {selectedPath && (
          <path className="province-topography-shape is-selected" d={selectedPath} pointerEvents="none" />
        )}
      </g>
    </g>
  );
}

export const ProvinceLayer = React.memo(ProvinceLayerComponent);
