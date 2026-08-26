import React, { useMemo } from 'react';

function formatBytes(value) {
  if (!value) return '0 MB';
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatThaiDate(value) {
  if (!value) return 'ยังไม่มีข้อมูล';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ยังไม่มีข้อมูล';

  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function TravelDashboard({
  open,
  user,
  photos,
  totalStats,
  exportingFormat,
  onClose,
  onManagePhotos,
  onExport,
}) {
  const dashboard = useMemo(() => {
    const provinceCounts = new Map();
    const storageBytes = photos.reduce((sum, photo) => sum + (photo.imageSize ?? 0), 0);
    const latestPhoto = photos[0] ?? null;

    photos.forEach((photo) => {
      if (!photo.provinceCode) return;
      const current = provinceCounts.get(photo.provinceCode) ?? {
        provinceCode: photo.provinceCode,
        provinceName: photo.provinceName ?? 'ไม่ทราบจังหวัด',
        photoCount: 0,
      };
      current.photoCount += 1;
      provinceCounts.set(photo.provinceCode, current);
    });

    return {
      storageBytes,
      latestPhoto,
      progress: Math.round((totalStats.visitedProvinceCount / 77) * 100),
      topProvinces: [...provinceCounts.values()].sort((first, second) => second.photoCount - first.photoCount).slice(0, 5),
    };
  }, [photos, totalStats.visitedProvinceCount]);

  if (!open) return null;

  return (
    <div className="travel-dashboard" role="dialog" aria-modal="true" aria-label="แดชบอร์ดการเดินทาง">
      <button className="dashboard-backdrop" type="button" onClick={onClose} aria-label="ปิดแดชบอร์ด" />
      <section className="dashboard-panel">
        <div className="dashboard-header">
          <div>
            <p className="panel-kicker">แดชบอร์ด</p>
            <h2>{user?.name ?? 'นักเดินทาง'}</h2>
            <p>ภาพรวมความทรงจำที่นำเข้าจากรูปจริงและข้อมูลบนแผนที่</p>
          </div>
          <div className="dashboard-header-actions">
            <button type="button" onClick={() => onExport('json')} disabled={Boolean(exportingFormat)}>
              {exportingFormat === 'json' ? 'กำลัง export...' : 'Export JSON'}
            </button>
            <button type="button" onClick={() => onExport('csv')} disabled={Boolean(exportingFormat)}>
              {exportingFormat === 'csv' ? 'กำลัง export...' : 'Export CSV'}
            </button>
            <button className="auth-close" type="button" onClick={onClose} aria-label="ปิด">
              <span aria-hidden="true">&#10005;</span>
            </button>
          </div>
        </div>

        <div className="dashboard-grid">
          <article>
            <span>จังหวัดที่มีความทรงจำ</span>
            <strong>{totalStats.visitedProvinceCount}/77</strong>
            <small>{dashboard.progress}% ของประเทศไทย</small>
          </article>
          <article>
            <span>รูปทั้งหมด</span>
            <strong>{photos.length}</strong>
            <small>บันทึกใน Prisma/MySQL</small>
          </article>
          <article>
            <span>พื้นที่รูป</span>
            <strong>{formatBytes(dashboard.storageBytes)}</strong>
            <small>เก็บไฟล์ใน backend/uploads</small>
          </article>
          <article>
            <span>ล่าสุด</span>
            <strong>{dashboard.latestPhoto?.provinceName ?? 'ยังไม่มีรูป'}</strong>
            <small>{formatThaiDate(dashboard.latestPhoto?.takenAt ?? dashboard.latestPhoto?.createdAt)}</small>
          </article>
        </div>

        <div className="dashboard-progress" aria-label={`ความคืบหน้า ${dashboard.progress}%`}>
          <span style={{ width: `${dashboard.progress}%` }} />
        </div>

        <div className="dashboard-section">
          {dashboard.topProvinces.length ? (
            <>
              <div className="dashboard-section-header">
                <h3>จังหวัดที่มีรูปมากที่สุด</h3>
                <button type="button" onClick={onManagePhotos}>จัดการรูป</button>
              </div>
              <div className="dashboard-province-list">
                {dashboard.topProvinces.map((province) => (
                  <article key={province.provinceCode}>
                    <strong>{province.provinceName}</strong>
                    <span>{province.photoCount} รูป</span>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="dashboard-empty">
              <strong>ยังไม่มีรูปของคุณ</strong>
              <p>กด “นำเข้ารูป” แล้วเลือกรูปจากเครื่อง ถ้ารูปไม่มี GPS ระบบจะให้เลือกจังหวัดเอง</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
