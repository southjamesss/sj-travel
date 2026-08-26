import React, { useDeferredValue, useMemo, useState } from 'react';
import { thailandProvincesGeojson } from '../../data/travelMemoryData';
import { getPhotoImageSource } from '../../lib/photoImage';

function formatThaiDate(value) {
  if (!value) return 'ไม่พบวันที่';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ไม่พบวันที่';

  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const provinceOptions = thailandProvincesGeojson.features
  .map((feature) => ({
    code: feature.properties.code,
    name: feature.properties.thaiName,
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'th'));

function PhotoManagerComponent({
  open,
  photos,
  deletingPhotoId,
  updatingPhotoId,
  onClose,
  onDelete,
  onUpdate,
}) {
  const [search, setSearch] = useState('');
  const [provinceCode, setProvinceCode] = useState('all');
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editForm, setEditForm] = useState({
    placeName: '',
    caption: '',
    provinceCode: '',
    provinceName: '',
    latitude: '',
    longitude: '',
  });
  const [editError, setEditError] = useState('');
  const deferredSearch = useDeferredValue(search);

  const filteredPhotos = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return photos.filter((photo) => {
      const matchesProvince = provinceCode === 'all' || photo.provinceCode === provinceCode;
      const searchableText = [
        photo.fileName,
        photo.placeName,
        photo.provinceName,
        photo.caption,
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesProvince && (!query || searchableText.includes(query));
    });
  }, [deferredSearch, photos, provinceCode]);

  if (!open) return null;

  const startEdit = (photo) => {
    setEditingPhotoId(photo.id);
    setEditError('');
    setEditForm({
      placeName: photo.placeName ?? '',
      caption: photo.caption ?? '',
      provinceCode: photo.provinceCode ?? '',
      provinceName: photo.provinceName ?? '',
      latitude: photo.latitude ?? '',
      longitude: photo.longitude ?? '',
    });
  };

  const updateEditField = (field) => (event) => {
    const value = event.target.value;

    if (field === 'provinceCode') {
      const province = provinceOptions.find((item) => item.code === value);
      setEditForm((current) => ({
        ...current,
        provinceCode: value,
        provinceName: province?.name ?? '',
      }));
      return;
    }

    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const photo = photos.find((item) => item.id === editingPhotoId);
    if (!photo) return;

    try {
      await onUpdate(photo, editForm);
      setEditError('');
      setEditingPhotoId(null);
    } catch (error) {
      setEditError(error.message || 'บันทึกข้อมูลรูปไม่สำเร็จ');
    }
  };

  return (
    <div className="photo-manager" role="dialog" aria-modal="true" aria-label="จัดการรูปที่นำเข้า">
      <button className="photo-manager-backdrop" type="button" onClick={onClose} aria-label="ปิดหน้าจัดการรูป" />
      <section className="photo-manager-panel">
        <div className="photo-manager-header">
          <div>
            <p className="panel-kicker">รูปของฉัน</p>
            <h2>จัดการรูปที่นำเข้า</h2>
            <p>{photos.length} รูปที่บันทึกจาก GPS EXIF ในบัญชีนี้</p>
          </div>
          <button className="auth-close" type="button" onClick={onClose} aria-label="ปิด">
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>

        <div className="photo-manager-filters">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อรูป สถานที่ หรือคำบรรยาย"
          />
          <select value={provinceCode} onChange={(event) => setProvinceCode(event.target.value)}>
            <option value="all">ทุกจังหวัด</option>
            {provinceOptions.map((province) => (
              <option key={province.code} value={province.code}>{province.name}</option>
            ))}
          </select>
        </div>

        {photos.length === 0 ? (
          <div className="photo-manager-empty">
            <strong>ยังไม่มีรูปที่นำเข้า</strong>
            <p>กดปุ่ม “นำเข้ารูป” แล้วเลือกรูปที่มี GPS เพื่อให้ระบบจัดเข้าจังหวัดอัตโนมัติ</p>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="photo-manager-empty">
            <strong>ไม่พบรูปตามเงื่อนไข</strong>
            <p>ลองล้างคำค้นหาหรือเปลี่ยนจังหวัดที่กรองอยู่</p>
          </div>
        ) : (
          <div className="photo-manager-list">
            {filteredPhotos.map((photo) => {
              const editing = editingPhotoId === photo.id;
              const imageSource = getPhotoImageSource(photo);

              return (
                <article className={`photo-manager-item ${editing ? 'is-editing' : ''}`} key={photo.id}>
                  <div className="photo-manager-thumb">
                    {imageSource && <img src={imageSource} alt="" loading="lazy" decoding="async" />}
                  </div>
                  {editing ? (
                    <form className="photo-edit-form" onSubmit={submitEdit}>
                      <input
                        type="text"
                        value={editForm.placeName}
                        onChange={updateEditField('placeName')}
                        placeholder="ชื่อสถานที่"
                      />
                      <select value={editForm.provinceCode} onChange={updateEditField('provinceCode')}>
                        <option value="">ไม่ระบุจังหวัด</option>
                        {provinceOptions.map((province) => (
                          <option key={province.code} value={province.code}>{province.name}</option>
                        ))}
                      </select>
                      <textarea
                        value={editForm.caption}
                        onChange={updateEditField('caption')}
                        placeholder="คำบรรยายรูป"
                        rows="2"
                      />
                      <div className="photo-edit-coordinates">
                        <input
                          type="number"
                          step="0.000001"
                          min="-90"
                          max="90"
                          value={editForm.latitude}
                          onChange={updateEditField('latitude')}
                          placeholder="ละติจูด เช่น 13.7563"
                        />
                        <input
                          type="number"
                          step="0.000001"
                          min="-180"
                          max="180"
                          value={editForm.longitude}
                          onChange={updateEditField('longitude')}
                          placeholder="ลองจิจูด เช่น 100.5018"
                        />
                      </div>
                      {editError && <p className="photo-edit-error">{editError}</p>}
                      <div className="photo-edit-actions">
                        <button type="submit" disabled={updatingPhotoId === photo.id}>
                          {updatingPhotoId === photo.id ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                        <button type="button" onClick={() => setEditingPhotoId(null)}>ยกเลิก</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="photo-manager-info">
                        <strong>{photo.placeName || photo.provinceName || photo.fileName}</strong>
                        <span>{photo.provinceName || 'ไม่ทราบจังหวัด'} / {formatThaiDate(photo.takenAt ?? photo.createdAt)}</span>
                        <small>{photo.caption || photo.fileName}</small>
                      </div>
                      <div className="photo-manager-actions">
                        <button type="button" className="photo-edit-button" onClick={() => startEdit(photo)}>แก้ไข</button>
                        <button
                          type="button"
                          className="photo-delete-button"
                          disabled={deletingPhotoId === photo.id}
                          onClick={() => onDelete(photo)}
                        >
                          {deletingPhotoId === photo.id ? 'กำลังลบ...' : 'ลบ'}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export const PhotoManager = React.memo(PhotoManagerComponent);
