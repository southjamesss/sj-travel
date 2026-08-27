import React, { useCallback, useEffect, useRef, useState } from 'react';
import { mapViewBox } from '../../data/travelMemoryData';
import { PhotoMarkers } from './PhotoMarkers';
import { PlaceMarkers } from './PlaceMarkers';
import { ProvinceLayer } from './ProvinceLayer';

function ThailandMapComponent({
  camera,
  provinces,
  places,
  selectedProvince,
  selectedPlace,
  viewLevel,
  onProvinceSelect,
  onProvinceHover,
  onProvinceLeave,
  onPlaceSelect,
  onPhotoSelect,
  pan,
  onPanChange,
  onWheelZoom,
}) {
  const cameraLayerRef = useRef(null);
  const cameraRef = useRef(camera);
  const panRef = useRef(pan);
  const rafRef = useRef(null);
  const wheelDeltaRef = useRef(0);
  const wheelRafRef = useRef(null);
  const wheelZoomingRef = useRef(false);
  const wheelZoomTimeoutRef = useRef(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPan: { x: 0, y: 0 },
  });
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [wheelZooming, setWheelZooming] = useState(false);
  const [cameraTransitioning, setCameraTransitioning] = useState(false);

  const shouldIgnoreClick = useCallback(() => suppressClickRef.current, []);
  const getTransform = (nextCamera, nextPan) =>
    `translate(${nextCamera.x + nextPan.x}px, ${nextCamera.y + nextPan.y}px) scale(${nextCamera.scale})`;

  const applyCameraTransform = () => {
    rafRef.current = null;
    if (!cameraLayerRef.current) return;
    cameraLayerRef.current.style.transform = getTransform(cameraRef.current, panRef.current);
  };

  const scheduleCameraTransform = () => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(applyCameraTransform);
  };

  useEffect(() => {
    cameraRef.current = camera;
    panRef.current = pan;
    if (!dragRef.current.active) {
      scheduleCameraTransform();
    }
  }, [camera, pan]);

  useEffect(() => {
    if (dragRef.current.active || wheelZoomingRef.current) return undefined;

    setCameraTransitioning(true);
    const timeoutId = window.setTimeout(() => setCameraTransitioning(false), 540);
    return () => window.clearTimeout(timeoutId);
  }, [camera]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (wheelRafRef.current !== null) {
        window.cancelAnimationFrame(wheelRafRef.current);
      }
      if (wheelZoomTimeoutRef.current !== null) {
        window.clearTimeout(wheelZoomTimeoutRef.current);
      }
    },
    [],
  );

  const startPan = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest?.('button, input, label')) return;

    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: panRef.current,
    };
  };

  const movePan = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.moved && Math.hypot(deltaX, deltaY) > 4) {
      drag.moved = true;
      setDragging(true);
    }

    if (!drag.moved) return;

    event.preventDefault();
    panRef.current = {
      x: drag.startPan.x + deltaX,
      y: drag.startPan.y + deltaY,
    };
    scheduleCameraTransform();
  };

  const endPan = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    if (drag.moved) {
      suppressClickRef.current = true;
      onPanChange(panRef.current);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    dragRef.current = {
      active: false,
      moved: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startPan: panRef.current,
    };
    setDragging(false);
  };

  const zoomWithWheel = (event) => {
    if (!onWheelZoom) return;

    event.preventDefault();
    if (!wheelZoomingRef.current) {
      wheelZoomingRef.current = true;
      setWheelZooming(true);
    }
    if (wheelZoomTimeoutRef.current !== null) {
      window.clearTimeout(wheelZoomTimeoutRef.current);
    }
    wheelZoomTimeoutRef.current = window.setTimeout(() => {
      wheelZoomingRef.current = false;
      wheelZoomTimeoutRef.current = null;
      setWheelZooming(false);
    }, 140);

    wheelDeltaRef.current += event.deltaY;

    if (wheelRafRef.current !== null) return;
    wheelRafRef.current = window.requestAnimationFrame(() => {
      const wheelDelta = wheelDeltaRef.current;
      wheelDeltaRef.current = 0;
      wheelRafRef.current = null;
      onWheelZoom(wheelDelta);
    });
  };

  return (
    <svg
      className={`travel-map ${dragging ? 'is-dragging' : ''} ${wheelZooming ? 'is-wheel-zooming' : ''} ${cameraTransitioning ? 'is-camera-transitioning' : ''}`}
      viewBox={`0 0 ${mapViewBox.width} ${mapViewBox.height}`}
      role="img"
      aria-label="แผนที่ความทรงจำประเทศไทยแบบโต้ตอบ"
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={endPan}
      onWheel={zoomWithWheel}
    >
      <defs>
        <linearGradient id="provinceLandGradient" x1="16%" y1="4%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#8d8260" stopOpacity="0.42" />
          <stop offset="48%" stopColor="#5d624c" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#313b33" stopOpacity="0.34" />
        </linearGradient>
        <linearGradient id="provinceHoverGradient" x1="10%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#fff2bd" stopOpacity="0.72" />
          <stop offset="52%" stopColor="#9bd8bf" stopOpacity="0.54" />
          <stop offset="100%" stopColor="#466e62" stopOpacity="0.44" />
        </linearGradient>
        <linearGradient id="provinceVisitedGradient" x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#bdf8e5" stopOpacity="0.96" />
          <stop offset="48%" stopColor="#45b999" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#1f6e63" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="provinceSelectedGradient" x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#fff2ad" />
          <stop offset="48%" stopColor="#ffbf62" />
          <stop offset="100%" stopColor="#d87542" />
        </linearGradient>
        <linearGradient id="provinceFavoriteGradient" x1="12%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#ffe79c" />
          <stop offset="48%" stopColor="#f4a85a" />
          <stop offset="100%" stopColor="#d46a42" />
        </linearGradient>
        <pattern id="provinceTopographyPattern" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          <path d="M-10 10 C2 2 15 2 28 10 S52 18 64 10" fill="none" stroke="#fff6df" strokeOpacity="0.22" strokeWidth="1.15" />
          <path d="M-12 32 C1 24 17 24 31 32 S54 40 66 32" fill="none" stroke="#bdf8e5" strokeOpacity="0.18" strokeWidth="0.9" />
          <circle cx="14" cy="21" r="1.2" fill="#ffe0a1" fillOpacity="0.16" />
        </pattern>
        <filter id="provinceGlow" x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="5.5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0.98  0 0.75 0 0 0.46  0 0 0.45 0 0.2  0 0 0 0.92 0"
            result="warmGlow"
          />
          <feMerge>
            <feMergeNode in="warmGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="provinceSelectedGlow" x="-55%" y="-55%" width="210%" height="210%">
          <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#000000" floodOpacity="0.42" />
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#ffcf78" floodOpacity="0.72" />
          <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor="#79d6bf" floodOpacity="0.26" />
        </filter>
        <filter id="provinceSoftDepth" x="-18%" y="-18%" width="136%" height="136%">
          <feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#000000" floodOpacity="0.32" />
        </filter>
        <filter id="provinceFineGlow" x="-24%" y="-24%" width="148%" height="148%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className="map-backdrop">
        <path d="M122 90 C270 -35 530 35 670 198 C786 334 742 558 622 714 C506 866 366 994 225 896 C71 789 34 256 122 90Z" />
      </g>
      <g
        ref={cameraLayerRef}
        className="map-camera"
        style={{
          transform: getTransform(camera, pan),
        }}
      >
        <ProvinceLayer
          features={provinces}
          selectedProvinceCode={selectedProvince?.properties.code}
          onProvinceSelect={onProvinceSelect}
          onProvinceHover={onProvinceHover}
          onProvinceLeave={onProvinceLeave}
          shouldIgnoreClick={shouldIgnoreClick}
        />
        <PlaceMarkers
          places={places}
          selectedPlaceId={selectedPlace?.id}
          visible={viewLevel === 'province' || viewLevel === 'place'}
          onPlaceSelect={onPlaceSelect}
          shouldIgnoreClick={shouldIgnoreClick}
        />
        <PhotoMarkers
          place={selectedPlace}
          visible={viewLevel === 'place'}
          onPhotoSelect={onPhotoSelect}
          shouldIgnoreClick={shouldIgnoreClick}
        />
      </g>
    </svg>
  );
}

export const ThailandMap = React.memo(ThailandMapComponent);
