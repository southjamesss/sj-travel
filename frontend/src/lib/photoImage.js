export function getPhotoImageSource(photo) {
  const source = photo?.imageUrl || photo?.imageData || '';
  const isHeic = /\.(heic|heif)(?:$|[?#])/i.test(source) || /image\/hei[cf]/i.test(photo?.mimeType || '');

  // Ask the backend for its browser-safe rendition of HEIC uploads.
  if (source && isHeic) return `${source}${source.includes('?') ? '&' : '?'}preview=jpeg`;
  return source;
}

export function photoImageStyle(photo, overlay = '') {
  const source = getPhotoImageSource(photo);
  if (!source) return undefined;

  return {
    backgroundImage: `${overlay ? `${overlay}, ` : ''}url("${source}")`,
  };
}
