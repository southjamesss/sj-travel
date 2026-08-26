const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? 'ไม่สามารถเชื่อมต่อระบบสมาชิกได้');
  }

  return data;
}

export async function loginWithPassword(credentials) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  return parseResponse(response);
}

export async function registerWithPassword(credentials) {
  const response = await fetch(`${apiBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  return parseResponse(response);
}

export async function fetchCurrentUser(token) {
  const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function logoutSession(token) {
  const response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}
