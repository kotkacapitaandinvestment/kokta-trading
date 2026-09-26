import { api } from './api';
import { compressImage } from '../features/community/util';

// Crops to a square, shrinks to 512px WebP, uploads it and makes it the
// profile photo. Returns the updated user.
export async function uploadAvatar(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file (JPG, PNG or WebP).');
  let image;
  try {
    image = await compressImage(file, { maxSide: 512, square: true, quality: 0.85 });
  } catch {
    throw new Error("That photo couldn't be read. Try a JPG or PNG.");
  }
  const { media } = await api.post('/media', image);
  const { user } = await api.put('/account/avatar', { mediaId: media.id });
  return user;
}

export async function removeAvatar() {
  const { user } = await api.put('/account/avatar', { mediaId: null });
  return user;
}
