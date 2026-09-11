import store from 'store';
import axiosInstance from './axios_setup';

// Thin wrappers around django_picasa's api/photos_watch_views.py endpoints -
// mirrors uploadActions.js's pattern. See picasaScreen.jsx's own comments
// on state.photoWatches/photoSyncSessions for why the actual sync flow
// (open Google's picker, poll, complete) is orchestrated there rather than
// in googlePhotosTool.jsx, which unmounts on tab switch.

export function listWatchedAlbums() {
  return axiosInstance.get(store.get('api_url') + '/google_photos/watch/');
}

export function createWatchedAlbum(title) {
  return axiosInstance.post(store.get('api_url') + '/google_photos/watch/', { title });
}

export function deleteWatchedAlbum(albumId) {
  return axiosInstance.delete(store.get('api_url') + '/google_photos/watch/' + albumId + '/');
}

export function initPickerSession(albumId) {
  return axiosInstance.post(store.get('api_url') + '/google_photos/watch/' + albumId + '/session/init/');
}

export function pollPickerSession(albumId, sessionId) {
  return axiosInstance.get(
    store.get('api_url') + '/google_photos/watch/' + albumId + '/session/' + sessionId + '/poll/');
}

export function completeSession(albumId, sessionId) {
  return axiosInstance.post(
    store.get('api_url') + '/google_photos/watch/' + albumId + '/session/' + sessionId + '/complete/');
}
