import React from 'react';
import { photoImageStyle } from '../../lib/photoImage';

function photoBackground(photo) {
  return photoImageStyle(photo, 'linear-gradient(180deg, transparent 38%, rgba(0, 0, 0, 0.66))');
}

function getLeadPlace(provincePlaces) {
  if (!provincePlaces.length) return null;

  return provincePlaces.reduce((leadPlace, place) => {
    if (!leadPlace) return place;
    return place.photoCount > leadPlace.photoCount ? place : leadPlace;
  }, null);
}

function getProvinceTeaserPhotos(provincePlaces) {
  const teaserPhotos = [];

  provincePlaces.forEach((place) => {
    place.photos.slice(0, 3).forEach((photo, photoIndex) => {
      teaserPhotos.push({
        id: `${place.id}-${photo.id}-${photoIndex}`,
        place,
        photo,
      });
    });
  });

  return teaserPhotos.slice(0, 4);
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
  provincePlaces = [],
  totalStats = { visitedProvinceCount: 0, photoCount: 0 },
  onPlaceSelect,
  onPhotoSelect,
  onProvincePhotoSelect,
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
    const leadPlace = getLeadPlace(provincePlaces);
    const leadPhoto = leadPlace?.photos?.[0] ?? null;
    const teaserPhotos = getProvinceTeaserPhotos(provincePlaces);
    return hasTrips ? (
      <aside className="memory-preview">
        <p className="panel-kicker">จังหวัด</p>
        <h2>{selectedProvince.properties.thaiName}</h2>
        <p className="preview-description">
          {leadPhoto
            ? 'กดรูปเพื่อเปิดแบบเต็มจอ หรือกดหมุดบนแผนที่เพื่อดูความทรงจำทั้งหมดของจังหวัดนี้'
            : 'เลือกหมุดบนแผนที่เพื่อเปิดความทรงจำของสถานที่'}
        </p>
        <div className="preview-stats">
          <span>{selectedProvince.properties.trips} ทริป</span>
          <span>{selectedProvince.properties.photos} รูป</span>
        </div>
        {leadPhoto && (
          <div className="province-memory-showcase">
            <button
              className={`province-memory-hero tone-${leadPhoto.tone ?? leadPlace.coverTone ?? 'sea'}`}
              type="button"
              style={photoBackground(leadPhoto)}
              onClick={() => {
                if (onProvincePhotoSelect) {
                  onProvincePhotoSelect(leadPlace, leadPhoto);
                  return;
                }

                onPlaceSelect?.(leadPlace);
              }}
            >
              <span className="province-memory-badge">เปิดรูปแบบเต็มจอ</span>
              <span className="province-memory-copy">
                <strong>{leadPlace.thaiName}</strong>
                <small>{leadPlace.photoCount} รูป · {leadPlace.dateRange}</small>
              </span>
            </button>
            {teaserPhotos.length > 1 && (
              <div className="province-memory-strip" aria-label="รูปตัวอย่างของจังหวัด">
                {teaserPhotos.slice(1).map(({ id, place, photo }) => (
                  <button
                    key={id}
                    className={`province-memory-thumb tone-${photo.tone}`}
                    type="button"
                    style={photoBackground(photo)}
                    onClick={() => {
                      if (onProvincePhotoSelect) {
                        onProvincePhotoSelect(place, photo);
                        return;
                      }

                      onPlaceSelect?.(place);
                    }}
                  >
                    <span className="province-memory-thumb-copy">
                      <strong>{photo.thaiTitle}</strong>
                      <small>{place.thaiName}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
      {selectedPlace.photos.length > 0 && (
        <p className="preview-note">กดรูปเพื่อเปิดแบบเต็มจอ แล้วเลื่อนดูต่อด้วยปุ่มซ้ายขวา</p>
      )}
      <div className="preview-photo-grid" aria-label="ตัวอย่างรูปภาพ">
        {selectedPlace.photos.map((photo, photoIndex) => (
          <button
            key={photo.id}
            className={`preview-photo tone-${photo.tone}`}
            type="button"
            style={photoBackground(photo)}
            onClick={() => onPhotoSelect(photo)}
          >
            <span className="preview-photo-index">{photoIndex + 1}</span>
            <span className="preview-photo-copy">
              <strong>{photo.thaiTitle}</strong>
              <small>{photo.takenAt}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export const MemoryPreview = React.memo(MemoryPreviewComponent);
