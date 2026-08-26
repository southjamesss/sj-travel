import React, { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

const TravelMapPage = lazy(() =>
  import('./components/travel-map/TravelMapPage').then((module) => ({ default: module.TravelMapPage })),
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense
      fallback={(
        <main className="travel-map-page">
          <aside className="system-status" aria-live="polite">กำลังเปิดแผนที่...</aside>
        </main>
      )}
    >
      <TravelMapPage />
    </Suspense>
  </StrictMode>,
);
