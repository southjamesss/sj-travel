import React from 'react';

export function ProvinceHover({ hover }) {
  if (!hover) return null;

  const { province, x, y } = hover;

  return (
    <div className="province-hover" style={{ left: x, top: y }}>
      <strong>{province.properties.thaiName}</strong>
      <span>{province.properties.trips} ทริป</span>
      <span>{province.properties.photos} รูป</span>
    </div>
  );
}
