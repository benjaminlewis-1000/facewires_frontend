import store from 'store';
import axiosInstance from './axios_setup';

// Thin wrappers around django_picasa's api/photos_watch_views.py endpoints -
// mirrors uploadActions.js's pattern. See picasaScreen.jsx's own comments
// on state.photoWatches/photoSyncSessions for why the actual sync flow
// (open Google's picker, poll, complete) is orchestrated there rather than
// in googlePhotosTool.jsx, which unmounts on tab switch.

// "Connect Google Photos" panel (googlePhotosTool.jsx) - client_secret is
// write-only over this API (never echoed back by GET), only whether one
// is configured/connected.
export function getCredentialStatus() {
  return axiosInstance.get(store.get('api_url') + '/google_photos/credentials/');
}

export function saveCredentials(clientId, clientSecret) {
  return axiosInstance.post(store.get('api_url') + '/google_photos/credentials/', {
    client_id: clientId, client_secret: clientSecret,
  });
}

// Not an axios call - the "Connect Google Photos" button navigates the
// whole browser here (window.location.href = this), same as the app's
// existing Authelia SSO login redirect (see CLAUDE.md). The backend's
// OAuth start/callback views are a plain redirect chain out to Google and
// back, not JSON endpoints, so there's nothing for axios to fetch.
export function oauthStartUrl() {
  return store.get('api_url') + '/google_photos/oauth/start/';
}

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
