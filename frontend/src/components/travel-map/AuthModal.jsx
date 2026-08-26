import React, { useState } from 'react';

export function AuthModal({ onClose, onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: 'นักเดินทาง',
    email: '',
    password: '',
  });
  const isRegister = mode === 'register';

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    const email = form.email.trim();
    const name = form.name.trim() || 'นักเดินทาง';

    if (!email || !form.password || (isRegister && !name)) return;

    try {
      setLoading(true);
      setError('');
      if (isRegister) {
        await onRegister({ name, email, password: form.password });
        return;
      }

      await onLogin({ email, password: form.password });
    } catch (loginError) {
      setError(loginError.message);
      setLoading(false);
    }
  };

  const title = isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  const copy = isRegister
    ? 'สร้างบัญชีใหม่เพื่อบันทึกแผนที่ความทรงจำของคุณ ระบบจะเก็บข้อมูลผู้ใช้ไว้ใน MySQL ผ่าน Prisma'
    : 'เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่สมัครไว้ เพื่อจัดการแผนที่ความทรงจำของคุณ';
  const buttonText = isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  const loadingText = isRegister ? 'กำลังสมัครสมาชิก...' : 'กำลังเข้าสู่ระบบ...';

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button className="auth-backdrop" type="button" onClick={onClose} aria-label="ปิดหน้าต่างบัญชีผู้ใช้" />
      <form className="auth-panel" onSubmit={submitAuth}>
        <div className="auth-panel-header">
          <p className="panel-kicker">บัญชีผู้ใช้</p>
          <button className="auth-close" type="button" onClick={onClose} aria-label="ปิด">
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>
        <h2>{title}</h2>
        <p className="auth-copy">{copy}</p>

        <div className="auth-mode-tabs" role="tablist" aria-label="เลือกโหมดบัญชีผู้ใช้">
          <button
            type="button"
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => changeMode('login')}
            role="tab"
            aria-selected={mode === 'login'}
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => changeMode('register')}
            role="tab"
            aria-selected={mode === 'register'}
          >
            สมัครสมาชิก
          </button>
        </div>

        {isRegister && (
          <label>
            ชื่อที่แสดง
            <input type="text" value={form.name} onChange={updateField('name')} autoComplete="name" required />
          </label>
        )}
        <label>
          อีเมล
          <input type="email" value={form.email} onChange={updateField('email')} autoComplete="email" required />
        </label>
        <label>
          รหัสผ่าน
          <input
            type="password"
            value={form.password}
            onChange={updateField('password')}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? loadingText : buttonText}
        </button>
        <p className="auth-note">ระบบนี้ใช้ Prisma/MySQL เก็บบัญชีผู้ใช้ รหัสผ่านแบบ hash และ session token</p>
      </form>
    </div>
  );
}
