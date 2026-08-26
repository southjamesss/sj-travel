import { thailandProvincesGeojson } from '../data/travelMemoryData';

function pointInRing([longitude, latitude], ring) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const intersects =
      currentLatitude > latitude !== previousLatitude > latitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;

  for (let index = 1; index < rings.length; index += 1) {
    if (pointInRing(point, rings[index])) return false;
  }

  return true;
}

function geometryContainsPoint(geometry, point) {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((rings) => pointInPolygon(point, rings));
  }

  return false;
}

export function findProvinceByLngLat(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  const feature = thailandProvincesGeojson.features.find((province) =>
    geometryContainsPoint(province.geometry, [longitude, latitude]),
  );

  if (!feature) return null;

  return {
    code: feature.properties.code,
    thaiName: feature.properties.thaiName,
    name: feature.properties.name,
  };
}
