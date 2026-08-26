import React from 'react';

function MapControlsComponent({
  zoomPercent,
  photoCount,
  canManagePhotos,
  onZoomIn,
  onZoomOut,
  onResetView,
  onManagePhotos,
  onOpenDashboard,
}) {
  return (
    <aside className="map-controls" aria-label="เครื่องมือแผนที่">
      <button type="button" onClick={onZoomIn} aria-label="ซูมเข้า">
        +
      </button>
      <strong>{zoomPercent}%</strong>
      <button type="button" onClick={onZoomOut} aria-label="ซูมออก">
        -
      </button>
      <button type="button" onClick={onResetView} aria-label="รีเซ็ตมุมมอง">
        รีเซ็ต
      </button>
      {canManagePhotos && (
        <button type="button" onClick={onManagePhotos} aria-label="จัดการรูปที่นำเข้า">
          รูป {photoCount}
        </button>
      )}
      {canManagePhotos && (
        <button type="button" onClick={onOpenDashboard} aria-label="ดูแดชบอร์ดการเดินทาง">
          สถิติ
        </button>
      )}
    </aside>
  );
}

export const MapControls = React.memo(MapControlsComponent);
