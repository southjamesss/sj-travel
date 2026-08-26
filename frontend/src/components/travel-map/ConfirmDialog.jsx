import React from 'react';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  loading = false,
  danger = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <button className="confirm-backdrop" type="button" onClick={onCancel} aria-label="ปิดหน้าต่างยืนยัน" />
      <section className="confirm-panel">
        <p className="panel-kicker">{danger ? 'ต้องยืนยันก่อนลบ' : 'ยืนยันการทำงาน'}</p>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button className={danger ? 'is-danger' : ''} type="button" onClick={onConfirm} disabled={loading}>
            {loading ? 'กำลังทำงาน...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
