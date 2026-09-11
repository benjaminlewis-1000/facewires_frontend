import store from 'store';
import axiosInstance from './axios_setup';

// Thin wrappers around django_picasa's api/upload_views.py endpoints (see
// the spec this was built from) - mirrors faceActions.js's pattern.

// axiosInstance's own default (axios_setup.jsx) is 15000ms - fine for a
// lightweight JSON call, nowhere near enough for an actual binary
// transfer of megabytes of data. Confirmed as the real cause of a
// reported 865MB upload failing with "chunks dropped" (2026-09-11): a
// ~25MB chunk (the documented default chunk_size) needs well over 15s on
// anything but a fast connection, so the request was being aborted
// client-side - and since the retry loop below reused the same
// undersized timeout, every retry attempt failed the exact same way
// instead of ever actually recovering. 5 minutes is generous for a
// single chunk (or a single-shot upload, capped at the same rough size
// by UPLOAD_CHUNK_THRESHOLD_BYTES) even on a slow connection - a request
// that's still running after that is worth giving up on and retrying
// fresh rather than waiting longer.
export const UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

// /complete/ isn't a byte-transfer endpoint, but for a zip it does real
// synchronous server-side work first - unzip, validate, and move every
// entry - before responding. Confirmed for real 2026-09-11: a zip
// upload that actually succeeded server-side (every photo landed,
// confirmed by the user) still showed as "failed" in the UI, because
// this call was still on the plain 15s default and gave up client-side
// before the server finished extracting a zip with many entries -
// exactly the same class of bug UPLOAD_REQUEST_TIMEOUT_MS fixed for the
// raw chunk/single-shot transfers, just missed here since this endpoint
// has no bytes of its own to transfer. Given even more headroom than
// that one, since extraction time scales with entry count in a way a
// single chunk's transfer time doesn't.
export const UPLOAD_COMPLETE_TIMEOUT_MS = 10 * 60 * 1000;

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

// 'axios-retry': { retries: 0 } disables axiosInstance's own global
// axios-retry config (axios_setup.jsx, 3 retries on 5xx) for this
// specific call. Found stacking badly with picasaScreen.jsx's own
// chunk-retry loop (2026-09-11): a persistently-failing chunk was being
// retried by BOTH layers - up to 5 outer attempts x 4 (axios-retry's
// 1 initial + 3 retries) inner attempts each, ~20 real HTTP requests
// with two independently-computed backoff delays stacking on top of
// each other, instead of the single, predictable 5-attempt budget the
// upload pipeline is actually designed around. The outer loop already
// covers everything axios-retry would (and also retries a 4xx checksum
// mismatch, which axios-retry never would), so it should be the only
// retry layer in play here.
export function uploadSingleShot(file, checksum, onUploadProgress) {
  const form = new FormData();
  form.append('file', file);
  form.append('checksum', checksum);
  const url = store.get('api_url') + '/upload/';
  // Content-Type explicitly cleared (axiosInstance's default forces
  // 'application/json') so the browser computes the real multipart
  // boundary itself instead of the server trying to parse a multipart
  // body as JSON.
  return axiosInstance.post(url, form, {
    headers: { 'Content-Type': undefined }, onUploadProgress,
    timeout: UPLOAD_REQUEST_TIMEOUT_MS, 'axios-retry': { retries: 0 },
  });
}

export function initChunkedUpload(filename, totalSize, checksum) {
  const url = store.get('api_url') + '/upload/chunked/init/';
  return axiosInstance.post(url, { filename, total_size: totalSize, checksum });
}

// See uploadSingleShot's own comment just above for why axios-retry is
// disabled here too - picasaScreen.jsx's _uploadChunkWithRetry is the
// sole retry layer for chunk uploads.
export function uploadChunk(uploadId, index, blob, checksum, onUploadProgress) {
  const form = new FormData();
  form.append('chunk', blob);
  form.append('checksum', checksum);
  const url = store.get('api_url') + '/upload/chunked/' + uploadId + '/chunk/' + index + '/';
  return axiosInstance.put(url, form, {
    headers: { 'Content-Type': undefined }, onUploadProgress,
    timeout: UPLOAD_REQUEST_TIMEOUT_MS, 'axios-retry': { retries: 0 },
  });
}

export function getChunkedStatus(uploadId) {
  const url = store.get('api_url') + '/upload/chunked/' + uploadId + '/status/';
  return axiosInstance.get(url);
}

export function completeChunkedUpload(uploadId) {
  const url = store.get('api_url') + '/upload/chunked/' + uploadId + '/complete/';
  // axios-retry disabled here too - re-POSTing /complete/ after a
  // request that actually succeeded server-side but whose response the
  // client didn't fully receive would hit the spec's own 409 ("session
  // already completed"), which is a confusing failure for something
  // that already worked, rather than the transient-failure retry
  // axios-retry is meant to handle.
  return axiosInstance.post(url, undefined, { timeout: UPLOAD_COMPLETE_TIMEOUT_MS, 'axios-retry': { retries: 0 } });
}
