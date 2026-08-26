export function getPhotoImageSource(photo) {
  return photo?.imageUrl || photo?.imageData || '';
}

export function photoImageStyle(photo, overlay = '') {
  const source = getPhotoImageSource(photo);
  if (!source) return undefined;

  return {
    backgroundImage: `${overlay ? `${overlay}, ` : ''}url("${source}")`,
  };
}
