const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? 'ไม่สามารถเชื่อมต่อระบบรูปภาพได้');
  }

  return data;
}

export async function fetchTravelPhotos(token) {
  const response = await fetch(`${apiBaseUrl}/api/photos`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function importTravelPhotos(token, photos) {
  if (photos.some((photo) => photo.file)) {
    const formData = new FormData();
    const metadata = photos.map(({ file, ...photo }) => photo);

    formData.append('photos', JSON.stringify(metadata));
    photos.forEach((photo) => {
      formData.append('files', photo.file, photo.uploadFileName || photo.fileName);
    });

    const response = await fetch(`${apiBaseUrl}/api/photos/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    return parseResponse(response);
  }

  const response = await fetch(`${apiBaseUrl}/api/photos/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ photos }),
  });

  return parseResponse(response);
}

export async function deleteTravelPhoto(token, photoId) {
  const response = await fetch(`${apiBaseUrl}/api/photos/${photoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function updateTravelPhoto(token, photoId, data) {
  const response = await fetch(`${apiBaseUrl}/api/photos/${photoId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  return parseResponse(response);
}

export async function exportTravelBackup(token, format = 'json') {
  const path = format === 'csv' ? '/api/export.csv' : '/api/export';
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? 'ไม่สามารถ export ข้อมูลได้');
  }

  return response.blob();
}
