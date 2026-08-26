import React from 'react';
import { photoImageStyle } from '../../lib/photoImage';

function photoBackground(photo) {
  return photoImageStyle(photo, 'linear-gradient(180deg, transparent 38%, rgba(0, 0, 0, 0.66))');
}

function ProvinceEmptyState({ province }) {
  const hasStats = province.properties.trips > 0 || province.properties.photos > 0;

  return (
    <aside className="memory-preview">
      <p className="panel-kicker">จังหวัด</p>
      <h2>{province.properties.thaiName}</h2>
      <p className="preview-description">ยังไม่มีความทรงจำในจังหวัดนี้</p>
      {hasStats && (
        <div className="preview-stats">
          <span>{province.properties.trips} ทริป</span>
          <span>{province.properties.photos} รูป</span>
        </div>
      )}
    </aside>
  );
}

function MemoryPreviewComponent({
  selectedProvince,
  selectedPlace,
  totalStats = { visitedProvinceCount: 0, photoCount: 0 },
  onPhotoSelect,
}) {
  if (!selectedProvince) {
    const hasPhotos = totalStats.photoCount > 0;

    return (
      <aside className="memory-preview memory-preview-home">
        <p className="panel-kicker">แผนที่ความทรงจำ</p>
        <h1 className="home-title">
          ประเทศไทย
          <span>ในความทรงจำ</span>
        </h1>
        <div className="memory-metadata" aria-label="ระบบบันทึกความทรงจำ">
          <span>77 จังหวัด</span>
          <span>GPS EXIF</span>
          <span>Prisma/MySQL</span>
        </div>
        <p className="preview-description">
          {hasPhotos
            ? 'จังหวัดที่เคยไปจะเรืองแสง กดจังหวัดเพื่อซูมเข้าและดูรูปจากทริป'
            : 'ยังไม่มีรูปในบัญชีนี้ กด “นำเข้ารูป” เพื่อเริ่มสร้างแผนที่ความทรงจำ'}
        </p>
        {hasPhotos && (
          <div className="preview-stats">
            <span>{totalStats.visitedProvinceCount} จังหวัดที่เคยไป</span>
            <span>{totalStats.photoCount} รูป</span>
          </div>
        )}
      </aside>
    );
  }

  if (!selectedPlace) {
    const hasTrips = selectedProvince.properties.trips > 0;
    return hasTrips ? (
      <aside className="memory-preview">
        <p className="panel-kicker">จังหวัด</p>
        <h2>{selectedProvince.properties.thaiName}</h2>
        <p className="preview-description">เลือกหมุดบนแผนที่เพื่อเปิดความทรงจำของสถานที่</p>
        <div className="preview-stats">
          <span>{selectedProvince.properties.trips} ทริป</span>
          <span>{selectedProvince.properties.photos} รูป</span>
        </div>
      </aside>
    ) : (
      <ProvinceEmptyState province={selectedProvince} />
    );
  }

  return (
    <aside className="memory-preview">
      <p className="panel-kicker">{selectedPlace.dateRange}</p>
      <h2>{selectedPlace.thaiName}</h2>
      <p className="preview-description">{selectedPlace.description}</p>
      <div className="preview-stats">
        <span>{selectedPlace.photoCount} รูป</span>
        <span>{selectedPlace.name}</span>
      </div>
      <div className="preview-photo-grid" aria-label="ตัวอย่างรูปภาพ">
        {selectedPlace.photos.map((photo) => (
          <button
            key={photo.id}
            className={`preview-photo tone-${photo.tone}`}
            type="button"
            style={photoBackground(photo)}
            onClick={() => onPhotoSelect(photo)}
          >
            <span>{photo.thaiTitle}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export const MemoryPreview = React.memo(MemoryPreviewComponent);
