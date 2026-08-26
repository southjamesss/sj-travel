import { mapViewBox, thailandProvincesGeojson } from '../data/travelMemoryData';

function getGeometryRings(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function getGeometryPoints(geometry) {
  return getGeometryRings(geometry).flat();
}

function getGeometryExteriorRings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

const projectedPointCache = new WeakMap();
const polygonPathCache = new WeakMap();
const featureBoundsCache = new WeakMap();

const allPoints = thailandProvincesGeojson.features.flatMap((feature) => getGeometryPoints(feature.geometry));
const longitudes = allPoints.map(([longitude]) => longitude);
const latitudes = allPoints.map(([, latitude]) => latitude);
const sourceBounds = {
  minLongitude: Math.min(...longitudes),
  maxLongitude: Math.max(...longitudes),
  minLatitude: Math.min(...latitudes),
  maxLatitude: Math.max(...latitudes),
};

const padding = 34;
const sourceWidth = sourceBounds.maxLongitude - sourceBounds.minLongitude;
const sourceHeight = sourceBounds.maxLatitude - sourceBounds.minLatitude;
const scale = Math.min(
  (mapViewBox.width - padding * 2) / sourceWidth,
  (mapViewBox.height - padding * 2) / sourceHeight,
);
const projectedWidth = sourceWidth * scale;
const projectedHeight = sourceHeight * scale;
const offsetX = (mapViewBox.width - projectedWidth) / 2;
const offsetY = (mapViewBox.height - projectedHeight) / 2;

export function projectLngLat([longitude, latitude]) {
  return [
    offsetX + (longitude - sourceBounds.minLongitude) * scale,
    offsetY + (sourceBounds.maxLatitude - latitude) * scale,
  ];
}

function getProjectedGeometryPoints(geometry) {
  const cachedPoints = projectedPointCache.get(geometry);
  if (cachedPoints) return cachedPoints;

  const points = getGeometryPoints(geometry).map(projectLngLat);
  projectedPointCache.set(geometry, points);
  return points;
}

export function polygonToPath(geometry) {
  const cachedPath = polygonPathCache.get(geometry);
  if (cachedPath) return cachedPath;

  const rings = getGeometryRings(geometry);
  const path = rings
    .map((ring) =>
      ring
        .map((coordinate, index) => {
          const [x, y] = projectLngLat(coordinate);
          return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' '),
    )
    .join(' Z ') + ' Z';

  polygonPathCache.set(geometry, path);
  return path;
}

export function getFeaturePoints(feature) {
  return getProjectedGeometryPoints(feature.geometry);
}

function getRingCentroid(ring) {
  const points = ring.map(projectLngLat);
  let doubledArea = 0;
  let centerX = 0;
  let centerY = 0;

  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [previousX, previousY] = points[previous];
    const [currentX, currentY] = points[index];
    const cross = previousX * currentY - currentX * previousY;

    doubledArea += cross;
    centerX += (previousX + currentX) * cross;
    centerY += (previousY + currentY) * cross;
  }

  if (Math.abs(doubledArea) < 0.000001) return null;

  return {
    x: centerX / (3 * doubledArea),
    y: centerY / (3 * doubledArea),
    area: Math.abs(doubledArea) / 2,
  };
}

function getFeatureFocusPoint(feature) {
  const centroids = getGeometryExteriorRings(feature.geometry).map(getRingCentroid).filter(Boolean);
  const totalArea = centroids.reduce((sum, centroid) => sum + centroid.area, 0);

  if (!totalArea) return null;

  return {
    x: centroids.reduce((sum, centroid) => sum + centroid.x * centroid.area, 0) / totalArea,
    y: centroids.reduce((sum, centroid) => sum + centroid.y * centroid.area, 0) / totalArea,
  };
}

export function getFeatureBounds(feature) {
  const cachedBounds = featureBoundsCache.get(feature.geometry);
  if (cachedBounds) return cachedBounds;

  const points = getFeaturePoints(feature);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;
  const focusPoint = getFeatureFocusPoint(feature);

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX,
    centerY,
    focusX: focusPoint?.x ?? centerX,
    focusY: focusPoint?.y ?? centerY,
  };

  featureBoundsCache.set(feature.geometry, bounds);
  return bounds;
}

export function getPointBounds([x, y], size = 95) {
  return {
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    centerX: x,
    centerY: y,
    focusX: x,
    focusY: y,
  };
}

export function getCameraTransform(bounds, paddingSize = 110, maxScale = 5.2, target = null) {
  if (!bounds) return { x: 0, y: 0, scale: 1 };

  const scaleX = (mapViewBox.width - paddingSize * 2) / bounds.width;
  const scaleY = (mapViewBox.height - paddingSize * 2) / bounds.height;
  const nextScale = Math.min(maxScale, scaleX, scaleY);
  const targetPoint = target ?? { x: mapViewBox.width / 2, y: mapViewBox.height / 2 };
  const focusX = bounds.focusX ?? bounds.centerX;
  const focusY = bounds.focusY ?? bounds.centerY;
  const x = targetPoint.x - focusX * nextScale;
  const y = targetPoint.y - focusY * nextScale;

  return {
    x,
    y,
    scale: nextScale,
    focusX,
    focusY,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
  };
}
