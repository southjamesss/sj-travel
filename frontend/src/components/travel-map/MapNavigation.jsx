import React from 'react';

function MapNavigationComponent({
  viewLevel,
  selectedProvince,
  selectedPlace,
  user,
  importingPhotos,
  onBack,
  onLoginClick,
  onLogoutClick,
  onPhotoFilesSelected,
  searchQuery,
  searchResults,
  onSearchChange,
  onSearchSelect,
}) {
  const crumb = [
    'ประเทศไทย',
    selectedProvince?.properties.thaiName,
    selectedPlace?.thaiName,
  ].filter(Boolean);

  return (
    <header className="map-navigation">
      <a className="map-brand" href="#map" aria-label="หน้าแรกแผนที่ความทรงจำ">TM</a>
      <div className="map-crumbs" aria-label="ระดับแผนที่ปัจจุบัน">
        {crumb.map((item, index) => (
          <React.Fragment key={item}>
            {index > 0 && <span>/</span>}
            <strong>{item}</strong>
          </React.Fragment>
        ))}
      </div>
      <div className="map-search" role="search">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="ค้นหาจังหวัด สถานที่ หรือรูป"
          aria-label="ค้นหาบนแผนที่"
        />
        {searchQuery && (
          <div className="map-search-results">
            {searchResults.length ? (
              searchResults.map((result) => (
                <button key={result.id} type="button" onClick={() => onSearchSelect(result)}>
                  <strong>{result.label}</strong>
                  <span>{result.description}</span>
                </button>
              ))
            ) : (
              <p>ไม่พบผลลัพธ์</p>
            )}
          </div>
        )}
      </div>
      <div className="nav-actions">
        {user ? (
          <>
            <span className="user-chip" title={user.email}>{user.name}</span>
            <label className={`auth-action-button import-photo-button ${importingPhotos ? 'is-loading' : ''}`}>
              <span aria-hidden="true">{importingPhotos ? '...' : '+'}</span>
              {importingPhotos ? 'กำลังนำเข้า...' : 'นำเข้ารูป'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                disabled={importingPhotos}
                onChange={(event) => {
                  onPhotoFilesSelected(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            <button className="auth-action-button" type="button" onClick={onLogoutClick}>ออกจากระบบ</button>
          </>
        ) : (
          <button className="auth-action-button" type="button" onClick={onLoginClick}>เข้าสู่ระบบ</button>
        )}
        <button className="nav-icon-button" type="button" onClick={onBack} disabled={viewLevel === 'country'} aria-label="กลับ">
          <span aria-hidden="true">&#8592;</span>
        </button>
      </div>
    </header>
  );
}

export const MapNavigation = React.memo(MapNavigationComponent);
