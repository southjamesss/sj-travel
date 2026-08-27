import React, { lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { mapViewBox, memoryPlaces, thailandProvincesGeojson } from '../../data/travelMemoryData';
import { fetchCurrentUser, loginWithPassword, logoutSession, registerWithPassword } from '../../lib/authApi';
import { getCameraTransform, getFeatureBounds, getPointBounds, projectLngLat } from '../../lib/mapGeometry';
import {
  deleteTravelPhoto,
  exportTravelBackup,
  fetchTravelPhotos,
  importTravelPhotos,
  updateTravelPhoto,
} from '../../lib/photoApi';
import { prepareImageUpload, readPhotoMetadata } from '../../lib/photoMetadata';
import { findProvinceByLngLat } from '../../lib/provinceLookup';
import { MapControls } from './MapControls';
import { MapNavigation } from './MapNavigation';
import { MemoryPreview } from './MemoryPreview';
import { ProvinceHover } from './ProvinceHover';
import { ThailandMap } from './ThailandMap';

const AuthModal = lazy(() => import('./AuthModal').then((module) => ({ default: module.AuthModal })));
const ConfirmDialog = lazy(() => import('./ConfirmDialog').then((module) => ({ default: module.ConfirmDialog })));
const ManualPhotoImport = lazy(() => import('./ManualPhotoImport').then((module) => ({ default: module.ManualPhotoImport })));
const PhotoGallery = lazy(() => import('./PhotoGallery').then((module) => ({ default: module.PhotoGallery })));
const PhotoManager = lazy(() => import('./PhotoManager').then((module) => ({ default: module.PhotoManager })));
const TravelDashboard = lazy(() => import('./TravelDashboard').then((module) => ({ default: module.TravelDashboard })));

const importLimit = 30;
const minMapZoom = 0.75;
const maxMapZoom = 2.25;
const mapZoomStep = 0.2;
const toneCycle = ['sea', 'forest', 'sand', 'sunset'];
const mapCircleFocus = {
  x: mapViewBox.width * 0.58,
  y: mapViewBox.height * 0.43,
};
const provinceFeatureByCode = new Map(
  thailandProvincesGeojson.features.map((feature) => [feature.properties.code, feature]),
);

function clampMapZoom(value) {
  return Math.min(maxMapZoom, Math.max(minMapZoom, Number(value.toFixed(2))));
}

function ModalFallback() {
  return (
    <aside className="system-status" aria-live="polite">
      กำลังเปิดหน้าต่าง...
    </aside>
  );
}

function formatThaiDate(value) {
  if (!value) return 'ไม่พบวันที่ในรูป';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ไม่พบวันที่ในรูป';

  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function average(items, selector) {
  const values = items.map(selector).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mergeTravelPhotos(currentPhotos, nextPhotos) {
  const photosById = new Map();
  [...nextPhotos, ...currentPhotos].forEach((photo) => {
    photosById.set(photo.id, photo);
  });

  return [...photosById.values()];
}

function getProvinceFallbackMapPoint(provinceCode) {
  const feature = provinceFeatureByCode.get(provinceCode);
  if (!feature) return null;
  const bounds = getFeatureBounds(feature);
  return [bounds.focusX, bounds.focusY];
}

function getOffsetMapPoint(mapPoint, index) {
  if (!mapPoint) return null;
  const offsetX = ((index % 3) - 1) * 10;
  const offsetY = (Math.floor(index / 3) % 3 - 1) * 10;
  return [mapPoint[0] + offsetX, mapPoint[1] + offsetY];
}

function getPhotoMapPoint(photo, fallbackMapPoint, index) {
  if (Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)) {
    return projectLngLat([photo.longitude, photo.latitude]);
  }

  return getOffsetMapPoint(fallbackMapPoint, index);
}

function getProjectedMapPoint(longitude, latitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return projectLngLat([longitude, latitude]);
}

function createImportItemId(file, index) {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${file.name}-${file.lastModified}-${index}`;
}

function manualImportReason(metadata, hasProvince) {
  if (metadata.latitude === null || metadata.longitude === null) {
    return 'ไม่พบ GPS ในรูป';
  }

  if (!hasProvince) return 'พบ GPS แต่อยู่นอกขอบเขตประเทศไทย';
  return 'ต้องเลือกจังหวัดเอง';
}

function isSupportedImageFile(file) {
  if (file.type?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function exportFileName(format) {
  const date = new Date().toISOString().slice(0, 10);
  return `travel-memory-backup-${date}.${format}`;
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getPlaceDescription(place) {
  const provinceName = place.provinceCode
    ? provinceFeatureByCode.get(place.provinceCode)?.properties.thaiName ?? ''
    : '';
  return provinceName ? `สถานที่ / ${provinceName}` : 'สถานที่';
}

function removeDemoStats(feature) {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      trips: 0,
      photos: 0,
      visited: false,
      favorite: false,
    },
  };
}

function buildImportedPlaces(photos) {
  const groups = new Map();

  photos.forEach((photo) => {
    if (!photo.provinceCode) return;

    const group = groups.get(photo.provinceCode) ?? [];
    group.push(photo);
    groups.set(photo.provinceCode, group);
  });

  return [...groups.entries()].map(([provinceCode, provincePhotos], placeIndex) => {
    const provinceName = provincePhotos[0].provinceName ?? 'ไม่ทราบจังหวัด';
    const latitude = average(provincePhotos, (photo) => photo.latitude);
    const longitude = average(provincePhotos, (photo) => photo.longitude);
    const latestPhoto = provincePhotos[0];
    const fallbackMapPoint = getProvinceFallbackMapPoint(provinceCode);
    const placeMapPoint = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? projectLngLat([longitude, latitude])
      : fallbackMapPoint;

    return {
      id: `imported-${provinceCode}`,
      provinceCode,
      name: provinceName,
      thaiName: `รูปจาก${provinceName}`,
      dateRange: `ล่าสุด ${formatThaiDate(latestPhoto.takenAt ?? latestPhoto.createdAt)}`,
      photoCount: provincePhotos.length,
      latitude,
      longitude,
      mapPoint: placeMapPoint,
      description: `นำเข้าจากรูปจริง ${provincePhotos.length} รูปในจังหวัด${provinceName}`,
      coverTone: toneCycle[placeIndex % toneCycle.length],
      photos: provincePhotos.map((photo, photoIndex) => ({
        id: `imported-photo-${photo.id}`,
        title: photo.fileName,
        thaiTitle: photo.placeName || photo.provinceName || photo.fileName,
        takenAt: formatThaiDate(photo.takenAt ?? photo.createdAt),
        caption: photo.caption ?? `รูปนี้ถูกจัดเข้าจังหวัด${provinceName}จาก GPS ในไฟล์`,
        latitude: photo.latitude,
        longitude: photo.longitude,
        mapPoint: getPhotoMapPoint(photo, fallbackMapPoint, photoIndex),
        tone: toneCycle[photoIndex % toneCycle.length],
        imageData: photo.imageData,
        imageUrl: photo.imageUrl,
        imageSize: photo.imageSize,
      })),
    };
  });
}

function normalizePlaceMapPoints(place) {
  const fallbackMapPoint = place.provinceCode ? getProvinceFallbackMapPoint(place.provinceCode) : null;
  const placeMapPoint = place.mapPoint
    ?? getProjectedMapPoint(place.longitude, place.latitude)
    ?? fallbackMapPoint;

  return {
    ...place,
    mapPoint: placeMapPoint,
    photos: place.photos.map((photo, photoIndex) => ({
      ...photo,
      mapPoint: photo.mapPoint ?? getPhotoMapPoint(photo, placeMapPoint ?? fallbackMapPoint, photoIndex),
    })),
  };
}

const staticMemoryPlaces = memoryPlaces.map(normalizePlaceMapPoints);

export function TravelMapPage() {
  const [viewLevel, setViewLevel] = useState('country');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [hover, setHover] = useState(null);
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [importedPhotos, setImportedPhotos] = useState([]);
  const [photoImport, setPhotoImport] = useState({ loading: false, message: '', error: '' });
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapZoom, setMapZoom] = useState(1);
  const [photoManagerOpen, setPhotoManagerOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [manualImportItems, setManualImportItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeletePhoto, setPendingDeletePhoto] = useState(null);
  const [exportingFormat, setExportingFormat] = useState('');
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [updatingPhotoId, setUpdatingPhotoId] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const hoverFrameRef = useRef(null);
  const pendingHoverRef = useRef(null);
  const lastHoverRef = useRef({ provinceCode: null, x: 0, y: 0 });

  useEffect(() => {
    const storedToken = window.localStorage.getItem('travel-memory-token');
    if (!storedToken) {
      setSessionLoading(false);
      return;
    }

    fetchCurrentUser(storedToken)
      .then(({ user: currentUser }) => {
        setAuthToken(storedToken);
        setUser(currentUser);
      })
      .catch(() => {
        window.localStorage.removeItem('travel-memory-token');
        window.localStorage.removeItem('travel-memory-user');
      })
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    let ignore = false;

    if (!authToken) {
      setImportedPhotos([]);
      setPhotosLoading(false);
      return () => {
        ignore = true;
      };
    }

    setPhotosLoading(true);
    fetchTravelPhotos(authToken)
      .then(({ photos }) => {
        if (!ignore) {
          startTransition(() => {
            setImportedPhotos(photos);
          });
        }
      })
      .catch((error) => {
        if (!ignore) setPhotoImport({ loading: false, message: '', error: error.message });
      })
      .finally(() => {
        if (!ignore) setPhotosLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [authToken]);

  useEffect(
    () => () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
    },
    [],
  );

  const importedStatsByProvince = useMemo(() => {
    const stats = new Map();

    importedPhotos.forEach((photo) => {
      if (!photo.provinceCode) return;

      const current = stats.get(photo.provinceCode) ?? { photos: 0 };
      stats.set(photo.provinceCode, { photos: current.photos + 1 });
    });

    return stats;
  }, [importedPhotos]);

  const provinces = useMemo(
    () =>
      thailandProvincesGeojson.features.map((feature) => {
        const baseFeature = user ? removeDemoStats(feature) : feature;
        const importedStats = importedStatsByProvince.get(feature.properties.code);
        if (!importedStats) return baseFeature;

        return {
          ...baseFeature,
          properties: {
            ...baseFeature.properties,
            trips: baseFeature.properties.trips + 1,
            photos: baseFeature.properties.photos + importedStats.photos,
            visited: true,
          },
        };
      }),
    [importedStatsByProvince, user],
  );
  const importedPlaces = useMemo(() => buildImportedPlaces(importedPhotos), [importedPhotos]);
  const allMemoryPlaces = useMemo(
    () => (user ? importedPlaces : [...staticMemoryPlaces, ...importedPlaces]),
    [importedPlaces, user],
  );
  const totalStats = useMemo(
    () => ({
      visitedProvinceCount: provinces.filter((province) => province.properties.visited).length,
      photoCount: provinces.reduce((sum, province) => sum + province.properties.photos, 0),
    }),
    [provinces],
  );
  const searchCatalog = useMemo(() => {
    const items = provinces.map((province) => ({
      id: `province-${province.properties.code}`,
      type: 'province',
      label: province.properties.thaiName,
      description: 'จังหวัด',
      searchText: normalizeSearchText(`${province.properties.thaiName} ${province.properties.name}`),
      province,
    }));

    allMemoryPlaces.forEach((place) => {
      items.push({
        id: `place-${place.id}`,
        type: 'place',
        label: place.thaiName,
        description: getPlaceDescription(place),
        searchText: normalizeSearchText(`${place.thaiName} ${place.name} ${place.description}`),
        provinceCode: place.provinceCode,
        placeId: place.id,
      });

      place.photos.forEach((photo) => {
        items.push({
          id: `photo-${photo.id}`,
          type: 'photo',
          label: photo.thaiTitle,
          description: `${place.thaiName} / รูป`,
          searchText: normalizeSearchText(`${photo.thaiTitle} ${photo.title} ${photo.caption}`),
          provinceCode: place.provinceCode,
          placeId: place.id,
          photo,
        });
      });
    });

    return items;
  }, [allMemoryPlaces, provinces]);
  const searchResults = useMemo(() => {
    const query = normalizeSearchText(deferredSearchQuery);
    if (!query) return [];

    const results = [];

    for (const item of searchCatalog) {
      if (!item.searchText.includes(query)) continue;

      const { searchText, ...result } = item;
      results.push(result);
      if (results.length === 8) break;
    }

    return results;
  }, [deferredSearchQuery, searchCatalog]);
  const selectedProvince = useMemo(
    () => provinces.find((feature) => feature.properties.code === selectedProvinceCode) ?? null,
    [provinces, selectedProvinceCode],
  );
  const provincePlaces = useMemo(() => {
    if (!selectedProvinceCode) return [];

    return allMemoryPlaces.filter((place) => place.provinceCode === selectedProvinceCode);
  }, [allMemoryPlaces, selectedProvinceCode]);
  const selectedPlace = useMemo(
    () => provincePlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [provincePlaces, selectedPlaceId],
  );
  const galleryPhotos = selectedPlace?.photos ?? [];

  const camera = useMemo(() => {
    const withUserZoom = (baseCamera) => {
      const nextScale = baseCamera.scale * mapZoom;
      return {
        ...baseCamera,
        x: baseCamera.targetX - baseCamera.focusX * nextScale,
        y: baseCamera.targetY - baseCamera.focusY * nextScale,
        scale: nextScale,
      };
    };

    if (viewLevel === 'place' && selectedPlace) {
      return withUserZoom(getCameraTransform(getPointBounds(selectedPlace.mapPoint, 105), 250, 5.8, mapCircleFocus));
    }

    if (selectedProvince) {
      return withUserZoom(getCameraTransform(getFeatureBounds(selectedProvince), 145, 4.9, mapCircleFocus));
    }

    return withUserZoom(getCameraTransform({
      width: mapViewBox.width,
      height: mapViewBox.height,
      centerX: mapViewBox.width / 2,
      centerY: mapViewBox.height / 2,
      focusX: mapViewBox.width / 2,
      focusY: mapViewBox.height / 2,
    }, 0, 1, { x: mapViewBox.width / 2, y: mapViewBox.height / 2 }));
  }, [mapZoom, selectedPlace, selectedProvince, viewLevel]);

  const resetMapView = useCallback(() => {
    setMapPan({ x: 0, y: 0 });
    setMapZoom(1);
  }, []);

  const zoomIn = useCallback(() => {
    setMapZoom((currentZoom) => clampMapZoom(currentZoom + mapZoomStep));
  }, []);

  const zoomOut = useCallback(() => {
    setMapZoom((currentZoom) => clampMapZoom(currentZoom - mapZoomStep));
  }, []);

  const zoomFromWheel = useCallback((wheelDelta) => {
    const zoomDelta = Math.max(-0.18, Math.min(0.18, -wheelDelta / 650));
    setMapZoom((currentZoom) => clampMapZoom(currentZoom + zoomDelta));
  }, []);
  const openAuth = useCallback(() => {
    setAuthOpen(true);
  }, []);
  const openPhotoManager = useCallback(() => {
    setPhotoManagerOpen(true);
  }, []);
  const openDashboard = useCallback(() => {
    setDashboardOpen(true);
  }, []);

  const selectProvince = useCallback((province) => {
    setSelectedProvinceCode(province.properties.code);
    setSelectedPlaceId(null);
    setSelectedPhoto(null);
    resetMapView();
    setViewLevel('province');
  }, [resetMapView]);

  const selectPlace = useCallback((place) => {
    setSelectedPlaceId(place.id);
    setSelectedPhoto(null);
    resetMapView();
    setViewLevel('place');
  }, [resetMapView]);

  const openPhotoFromPlace = useCallback((place, photo) => {
    setSelectedPlaceId(place.id);
    setSelectedPhoto(photo);
    resetMapView();
    setViewLevel('place');
  }, [resetMapView]);

  const selectSearchResult = useCallback((result) => {
    setSearchQuery('');
    setSelectedPhoto(null);
    resetMapView();

    if (result.type === 'province') {
      setSelectedProvinceCode(result.province.properties.code);
      setSelectedPlaceId(null);
      setViewLevel('province');
      return;
    }

    setSelectedProvinceCode(result.provinceCode);
    setSelectedPlaceId(result.placeId);
    setViewLevel('place');

    if (result.type === 'photo') {
      setSelectedPhoto(result.photo);
    }
  }, [resetMapView]);

  const goBack = useCallback(() => {
    if (viewLevel === 'place') {
      setSelectedPlaceId(null);
      setSelectedPhoto(null);
      resetMapView();
      setViewLevel('province');
      return;
    }

    if (viewLevel === 'province') {
      setSelectedProvinceCode(null);
      setSelectedPlaceId(null);
      setSelectedPhoto(null);
      resetMapView();
      setViewLevel('country');
    }
  }, [resetMapView, viewLevel]);

  const flushHover = useCallback(() => {
    hoverFrameRef.current = null;
    const nextHover = pendingHoverRef.current;
    pendingHoverRef.current = null;
    if (nextHover) {
      lastHoverRef.current = {
        provinceCode: nextHover.province.properties.code,
        x: nextHover.x,
        y: nextHover.y,
      };
      setHover(nextHover);
    }
  }, []);

  const handleHover = useCallback((province, event) => {
    const nextHover = {
      province,
      x: event.clientX + 16,
      y: event.clientY + 16,
    };
    const lastHover = lastHoverRef.current;
    const isSameProvince = lastHover.provinceCode === province.properties.code;
    const movedEnough = Math.abs(nextHover.x - lastHover.x) > 8 || Math.abs(nextHover.y - lastHover.y) > 8;

    if (isSameProvince && !movedEnough) return;

    pendingHoverRef.current = {
      province,
      x: nextHover.x,
      y: nextHover.y,
    };

    if (hoverFrameRef.current === null) {
      hoverFrameRef.current = window.requestAnimationFrame(flushHover);
    }
  }, [flushHover]);

  const clearHover = useCallback(() => {
    pendingHoverRef.current = null;
    lastHoverRef.current = { provinceCode: null, x: 0, y: 0 };
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHover(null);
  }, []);

  const finishAuth = (result) => {
    window.localStorage.setItem('travel-memory-token', result.token);
    window.localStorage.setItem('travel-memory-user', JSON.stringify(result.user));
    setAuthToken(result.token);
    setUser(result.user);
    setAuthOpen(false);
  };

  const login = useCallback(async (credentials) => {
    const result = await loginWithPassword(credentials);
    finishAuth(result);
  }, []);

  const register = useCallback(async (credentials) => {
    const result = await registerWithPassword(credentials);
    finishAuth(result);
  }, []);

  const importPhotoDrafts = useCallback(async (photoDrafts, successMessage) => {
    const preparedPhotos = [];

    for (const draft of photoDrafts) {
      const upload = await prepareImageUpload(draft.file);
      preparedPhotos.push({
        ...draft,
        file: upload.file,
        mimeType: upload.mimeType,
        uploadFileName: upload.uploadFileName,
      });
    }

    const result = await importTravelPhotos(authToken, preparedPhotos);
    startTransition(() => {
      setImportedPhotos((currentPhotos) => mergeTravelPhotos(currentPhotos, result.photos));
    });
    setPhotoManagerOpen(true);
    setPhotoImport({
      loading: false,
      message: successMessage(result),
      error: '',
    });

    return result;
  }, [authToken]);

  const handlePhotoFilesSelected = useCallback(async (fileList) => {
    if (!authToken) {
      openAuth();
      return;
    }

    const files = Array.from(fileList ?? []).filter(isSupportedImageFile);
    if (!files.length) return;

    const selectedFiles = files.slice(0, importLimit);
    let skippedCount = files.length - selectedFiles.length;
    const provinceNames = new Set();
    const photosToImport = [];
    const manualItems = [];

    setPhotoImport({
      loading: true,
      message: `กำลังอ่านรูป ${selectedFiles.length} รูปที่คุณอนุญาตให้เข้าถึง...`,
      error: '',
    });

    try {
      for (const file of selectedFiles) {
        try {
          const metadata = await readPhotoMetadata(file);
          const hasCoordinates = metadata.latitude !== null && metadata.longitude !== null;
          const province = hasCoordinates ? findProvinceByLngLat(metadata.longitude, metadata.latitude) : null;

          if (!province) {
            manualItems.push({
              id: createImportItemId(file, manualItems.length),
              file,
              fileName: file.name,
              previewUrl: URL.createObjectURL(file),
              takenAt: metadata.takenAt,
              reason: manualImportReason(metadata, Boolean(province)),
            });
            continue;
          }

          provinceNames.add(province.thaiName);
          photosToImport.push({
            file,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            takenAt: metadata.takenAt,
            latitude: metadata.latitude,
            longitude: metadata.longitude,
            provinceCode: province.code,
            provinceName: province.thaiName,
            placeName: province.thaiName,
            caption: `นำเข้าจากรูป ${file.name} และพบพิกัดอยู่ในจังหวัด${province.thaiName}`,
          });
        } catch {
          manualItems.push({
            id: createImportItemId(file, manualItems.length),
            file,
            fileName: file.name,
            previewUrl: URL.createObjectURL(file),
            takenAt: null,
            reason: 'อ่านข้อมูลรูปไม่ได้ เลือกจังหวัดเองเพื่อบันทึกต่อ',
          });
        }
      }

      if (!photosToImport.length && !manualItems.length) {
        setPhotoImport({
          loading: false,
          message: '',
          error: 'ยังไม่พบรูปที่นำเข้าได้ ลองเลือกรูปใหม่อีกครั้ง',
        });
        return;
      }

      if (photosToImport.length) {
        await importPhotoDrafts(
          photosToImport,
          (result) =>
            `นำเข้า ${result.photos.length} รูปจาก ${[...provinceNames].join(', ')} แล้ว${
              manualItems.length ? ` และมี ${manualItems.length} รูปรอเลือกจังหวัด` : ''
            }${skippedCount ? ` ข้าม ${skippedCount} รูปเพราะเกินจำนวนที่กำหนด` : ''}`,
        );
      }

      if (manualItems.length) {
        setManualImportItems(manualItems);
        setManualImportOpen(true);
        setPhotoImport({
          loading: false,
          message: `มี ${manualItems.length} รูปที่ต้องเลือกจังหวัดเองก่อนบันทึก`,
          error: '',
        });
      }
    } catch (error) {
      manualItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setPhotoImport({ loading: false, message: '', error: error.message });
    }
  }, [authToken, importPhotoDrafts, openAuth]);

  const closeManualImport = () => {
    manualImportItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setManualImportItems([]);
    setManualImportOpen(false);
  };

  const confirmManualImport = async (items) => {
    if (!authToken) return;

    const provinceNames = new Set(items.map((item) => item.provinceName).filter(Boolean));
    const drafts = items.map((item) => ({
      file: item.file,
      fileName: item.fileName,
      mimeType: item.file.type || 'application/octet-stream',
      takenAt: item.takenAt,
      latitude: null,
      longitude: null,
      provinceCode: item.provinceCode,
      provinceName: item.provinceName,
      placeName: item.provinceName,
      caption: `นำเข้าจากรูป ${item.fileName} โดยเลือกจังหวัด${item.provinceName}เอง`,
    }));

    try {
      setPhotoImport({
        loading: true,
        message: `กำลังนำเข้ารูปที่เลือกจังหวัดเอง ${drafts.length} รูป...`,
        error: '',
      });
      await importPhotoDrafts(
        drafts,
        (result) => `นำเข้า ${result.photos.length} รูปจาก ${[...provinceNames].join(', ')} แล้ว`,
      );
      closeManualImport();
    } catch (error) {
      setPhotoImport({ loading: false, message: '', error: error.message });
    }
  };

  const deletePhoto = async (photo) => {
    if (!authToken) return;

    try {
      setDeletingPhotoId(photo.id);
      await deleteTravelPhoto(authToken, photo.id);
      startTransition(() => {
        setImportedPhotos((currentPhotos) => currentPhotos.filter((item) => item.id !== photo.id));
      });
      if (selectedPhoto?.id === `imported-photo-${photo.id}`) {
        setSelectedPhoto(null);
      }
      setPhotoImport({
        loading: false,
        message: `ลบรูป ${photo.fileName} แล้ว`,
        error: '',
      });
    } catch (error) {
      setPhotoImport({ loading: false, message: '', error: error.message });
      throw error;
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const requestDeletePhoto = (photo) => {
    setPendingDeletePhoto(photo);
  };

  const confirmDeletePhoto = async () => {
    if (!pendingDeletePhoto) return;
    try {
      await deletePhoto(pendingDeletePhoto);
      setPendingDeletePhoto(null);
    } catch {
      // Error message is already surfaced through the shared import/status panel.
    }
  };

  const updatePhoto = async (photo, data) => {
    if (!authToken) return;

    try {
      setUpdatingPhotoId(photo.id);
      const { photo: updatedPhoto } = await updateTravelPhoto(authToken, photo.id, data);
      startTransition(() => {
        setImportedPhotos((currentPhotos) =>
          currentPhotos.map((item) => (item.id === updatedPhoto.id ? updatedPhoto : item)),
        );
      });
      if (selectedPhoto?.id === `imported-photo-${photo.id}`) {
        setSelectedPhoto((currentPhoto) => currentPhoto
          ? {
              ...currentPhoto,
              thaiTitle: updatedPhoto.placeName || updatedPhoto.provinceName || updatedPhoto.fileName,
              caption: updatedPhoto.caption ?? currentPhoto.caption,
              latitude: updatedPhoto.latitude,
              longitude: updatedPhoto.longitude,
            }
          : currentPhoto);
      }
      setPhotoImport({
        loading: false,
        message: `บันทึกข้อมูลรูป ${updatedPhoto.fileName} แล้ว`,
        error: '',
      });
    } catch (error) {
      setPhotoImport({ loading: false, message: '', error: error.message });
      throw error;
    } finally {
      setUpdatingPhotoId(null);
    }
  };

  const exportBackup = useCallback(async (format) => {
    if (!authToken) return;

    try {
      setExportingFormat(format);
      const blob = await exportTravelBackup(authToken, format);
      downloadBlob(blob, exportFileName(format));
      setPhotoImport({
        loading: false,
        message: `ดาวน์โหลด backup แบบ ${format.toUpperCase()} แล้ว`,
        error: '',
      });
    } catch (error) {
      setPhotoImport({ loading: false, message: '', error: error.message });
    } finally {
      setExportingFormat('');
    }
  }, [authToken]);

  const logout = useCallback(async () => {
    if (authToken) {
      await logoutSession(authToken).catch(() => null);
    }

    window.localStorage.removeItem('travel-memory-token');
    window.localStorage.removeItem('travel-memory-user');
    setAuthToken('');
    setUser(null);
    setAuthOpen(false);
    setImportedPhotos([]);
    setPhotoManagerOpen(false);
    setDashboardOpen(false);
    setPendingDeletePhoto(null);
    setSearchQuery('');
    manualImportItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setManualImportItems([]);
    setManualImportOpen(false);
    resetMapView();
  }, [authToken, manualImportItems, resetMapView]);

  return (
    <main className={`travel-map-page view-${viewLevel}`} id="map">
      <ThailandMap
        camera={camera}
        pan={mapPan}
        provinces={provinces}
        places={provincePlaces}
        selectedProvince={selectedProvince}
        selectedPlace={selectedPlace}
        viewLevel={viewLevel}
        onProvinceSelect={selectProvince}
        onProvinceHover={handleHover}
        onProvinceLeave={clearHover}
        onPlaceSelect={selectPlace}
        onPhotoSelect={setSelectedPhoto}
        onPanChange={setMapPan}
        onWheelZoom={zoomFromWheel}
      />
      <MapNavigation
        viewLevel={viewLevel}
        selectedProvince={selectedProvince}
        selectedPlace={selectedPlace}
        user={user}
        importingPhotos={photoImport.loading}
        onBack={goBack}
        onLoginClick={openAuth}
        onLogoutClick={logout}
        onPhotoFilesSelected={handlePhotoFilesSelected}
        searchQuery={searchQuery}
        searchResults={searchResults}
        onSearchChange={setSearchQuery}
        onSearchSelect={selectSearchResult}
      />
      <MapControls
        zoomPercent={Math.round(mapZoom * 100)}
        photoCount={importedPhotos.length}
        canManagePhotos={Boolean(user)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={resetMapView}
        onManagePhotos={openPhotoManager}
        onOpenDashboard={openDashboard}
      />
      <MemoryPreview
        selectedProvince={selectedProvince}
        selectedPlace={selectedPlace}
        provincePlaces={provincePlaces}
        totalStats={totalStats}
        onPlaceSelect={selectPlace}
        onPhotoSelect={setSelectedPhoto}
        onProvincePhotoSelect={openPhotoFromPlace}
      />
      {(sessionLoading || photosLoading) && (
        <aside className="system-status" aria-live="polite">
          {sessionLoading ? 'กำลังตรวจสอบบัญชีผู้ใช้...' : 'กำลังโหลดรูปจากฐานข้อมูล...'}
        </aside>
      )}
      {user && !photosLoading && importedPhotos.length === 0 && !photoImport.loading && !manualImportOpen && (
        <aside className="journey-state-card">
          <p className="panel-kicker">เริ่มต้นบัญชีนี้</p>
          <strong>ยังไม่มีรูปของคุณ</strong>
          <span>กด “นำเข้ารูป” เพื่อให้ระบบอ่าน GPS หรือเลือกจังหวัดเองเมื่อรูปไม่มีตำแหน่ง</span>
        </aside>
      )}
      {(photoImport.loading || photoImport.message || photoImport.error) && (
        <aside className={`photo-import-status ${photoImport.error ? 'is-error' : ''}`} aria-live="polite">
          <p className="panel-kicker">นำเข้ารูป</p>
          <p>{photoImport.error || photoImport.message}</p>
        </aside>
      )}
      <ProvinceHover hover={hover} />
      <Suspense fallback={<ModalFallback />}>
        {selectedPhoto && (
          <PhotoGallery
            photo={selectedPhoto}
            photos={galleryPhotos}
            onClose={() => setSelectedPhoto(null)}
            onSelect={setSelectedPhoto}
          />
        )}
        {photoManagerOpen && (
          <PhotoManager
            open={photoManagerOpen}
            photos={importedPhotos}
            deletingPhotoId={deletingPhotoId}
            updatingPhotoId={updatingPhotoId}
            onClose={() => setPhotoManagerOpen(false)}
            onDelete={requestDeletePhoto}
            onUpdate={updatePhoto}
          />
        )}
        {dashboardOpen && (
          <TravelDashboard
            open={dashboardOpen}
            user={user}
            photos={importedPhotos}
            totalStats={totalStats}
            exportingFormat={exportingFormat}
            onClose={() => setDashboardOpen(false)}
            onManagePhotos={() => {
              setDashboardOpen(false);
              setPhotoManagerOpen(true);
            }}
            onExport={exportBackup}
          />
        )}
        {manualImportOpen && (
          <ManualPhotoImport
            open={manualImportOpen}
            items={manualImportItems}
            importing={photoImport.loading}
            onClose={closeManualImport}
            onConfirm={confirmManualImport}
          />
        )}
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onLogin={login} onRegister={register} />}
        {pendingDeletePhoto && (
          <ConfirmDialog
            open={Boolean(pendingDeletePhoto)}
            danger
            loading={deletingPhotoId === pendingDeletePhoto.id}
            title="ลบรูปนี้?"
            description={`รูป “${pendingDeletePhoto.fileName}” จะถูกลบออกจากบัญชีและไฟล์ใน backend/uploads`}
            confirmLabel="ลบรูป"
            onCancel={() => setPendingDeletePhoto(null)}
            onConfirm={confirmDeletePhoto}
          />
        )}
      </Suspense>
    </main>
  );
}
