import store from 'store';
import axiosInstance from './axios_setup';

// Thin wrappers around django_picasa's api/upload_views.py endpoints (see
// the spec this was built from) - mirrors faceActions.js's pattern.

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'heic', 'heif'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mpg', 'avi', 'm2ts', 'mts', 'wmv', '3gp', '3gpp', 'm4v', 'mkv'];
export const ARCHIVE_EXTENSIONS = ['zip'];
export const ACCEPTED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...ARCHIVE_EXTENSIONS];

export function extensionOf(filename) {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function isVideoFile(filename) {
  return VIDEO_EXTENSIONS.includes(extensionOf(filename));
}

// The backend still verifies actual file content regardless (a renamed
// .txt won't pass) - this is purely a fast client-side rejection so a
// clearly-wrong file doesn't get hashed/uploaded first only to fail.
export function hasAcceptedExtension(filename) {
  return ACCEPTED_EXTENSIONS.includes(extensionOf(filename));
}

// crypto.subtle is hardware-accelerated - hashing a 1GB file costs
// roughly 1-3s, negligible next to actual upload time. Safe to call on
// a whole file (single-shot, or a chunked upload's total-file checksum)
// or a single chunk's Blob slice.
export async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function uploadSingleShot(file, checksum, onUploadProgress) {
  const form = new FormData();
  form.append('file', file);
  form.append('checksum', checksum);
  const url = store.get('api_url') + '/upload/';
  // Content-Type explicitly cleared (axiosInstance's default forces
  // 'application/json') so the browser computes the real multipart
  // boundary itself instead of the server trying to parse a multipart
  // body as JSON.
  return axiosInstance.post(url, form, { headers: { 'Content-Type': undefined }, onUploadProgress });
}

export function initChunkedUpload(filename, totalSize, checksum) {
  const url = store.get('api_url') + '/upload/chunked/init/';
  return axiosInstance.post(url, { filename, total_size: totalSize, checksum });
}

export function uploadChunk(uploadId, index, blob, checksum, onUploadProgress) {
  const form = new FormData();
  form.append('chunk', blob);
  form.append('checksum', checksum);
  const url = store.get('api_url') + '/upload/chunked/' + uploadId + '/chunk/' + index + '/';
  return axiosInstance.put(url, form, { headers: { 'Content-Type': undefined }, onUploadProgress });
}

export function getChunkedStatus(uploadId) {
  const url = store.get('api_url') + '/upload/chunked/' + uploadId + '/status/';
  return axiosInstance.get(url);
}

export function completeChunkedUpload(uploadId) {
  const url = store.get('api_url') + '/upload/chunked/' + uploadId + '/complete/';
  return axiosInstance.post(url);
}
