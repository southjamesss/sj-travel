import React, { useEffect, useMemo, useState } from 'react';
import { thailandProvincesGeojson } from '../../data/travelMemoryData';

const provinceOptions = thailandProvincesGeojson.features
  .map((feature) => ({
    code: feature.properties.code,
    name: feature.properties.thaiName,
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'th'));

function fileSizeLabel(size) {
  if (!Number.isFinite(size)) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function ManualPhotoImport({ open, items, importing, onClose, onConfirm }) {
  const [rows, setRows] = useState([]);
  const [bulkProvinceCode, setBulkProvinceCode] = useState('');

  useEffect(() => {
    setRows(items.map((item) => ({ ...item, provinceCode: item.provinceCode ?? '', provinceName: item.provinceName ?? '' })));
    setBulkProvinceCode('');
  }, [items]);

  const readyCount = useMemo(() => rows.filter((row) => row.provinceCode).length, [rows]);

  if (!open) return null;

  const updateRowProvince = (id, code) => {
    const province = provinceOptions.find((item) => item.code === code);
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === id ? { ...row, provinceCode: code, provinceName: province?.name ?? '' } : row,
      ),
    );
  };

  const applyProvinceToAll = (code) => {
    const province = provinceOptions.find((item) => item.code === code);
    setBulkProvinceCode(code);
    setRows((currentRows) =>
      currentRows.map((row) => ({ ...row, provinceCode: code, provinceName: province?.name ?? '' })),
    );
  };

  const submit = (event) => {
    event.preventDefault();
    if (readyCount !== rows.length) return;
    onConfirm(rows);
  };

  return (
    <div className="manual-import" role="dialog" aria-modal="true" aria-label="เลือกจังหวัดให้รูปที่ไม่มี GPS">
      <button className="manual-import-backdrop" type="button" onClick={onClose} aria-label="ปิดหน้าตรวจรูป" />
      <form className="manual-import-panel" onSubmit={submit}>
        <div className="manual-import-header">
          <div>
            <p className="panel-kicker">ตรวจรูปก่อนนำเข้า</p>
            <h2>เลือกจังหวัดให้รูปที่ไม่มี GPS</h2>
            <p>รูปบางไฟล์ไม่มีตำแหน่งใน EXIF หรือเป็น HEIC ที่ browser อ่าน GPS ไม่ได้ เลือกจังหวัดแล้วระบบจะบันทึกเข้าบัญชีให้</p>
          </div>
          <button className="auth-close" type="button" onClick={onClose} aria-label="ปิด">
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>

        <label className="manual-bulk-select">
          ตั้งจังหวัดเดียวให้ทุกรูป
          <select value={bulkProvinceCode} onChange={(event) => applyProvinceToAll(event.target.value)}>
            <option value="">เลือกจังหวัด</option>
            {provinceOptions.map((province) => (
              <option key={province.code} value={province.code}>{province.name}</option>
            ))}
          </select>
        </label>

        <div className="manual-import-list">
          {rows.map((row) => (
            <article className="manual-import-item" key={row.id}>
              <div className="manual-import-thumb" style={{ backgroundImage: `url("${row.previewUrl}")` }} />
              <div className="manual-import-info">
                <strong>{row.fileName}</strong>
                <span>{row.reason}</span>
                <small>{fileSizeLabel(row.file?.size)}</small>
              </div>
              <select value={row.provinceCode} onChange={(event) => updateRowProvince(row.id, event.target.value)}>
                <option value="">เลือกจังหวัด</option>
                {provinceOptions.map((province) => (
                  <option key={province.code} value={province.code}>{province.name}</option>
                ))}
              </select>
            </article>
          ))}
        </div>

        <div className="manual-import-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={importing || readyCount !== rows.length}>
            {importing ? 'กำลังนำเข้า...' : `นำเข้า ${readyCount}/${rows.length} รูป`}
          </button>
        </div>
      </form>
    </div>
  );
}
