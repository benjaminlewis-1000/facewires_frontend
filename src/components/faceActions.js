import store from 'store';
import axiosInstance from './axios_setup';
import { withRetry } from './apiRetry';

// Shared endpoint-construction for the two mutating calls used to move a
// face between people: a single-face reassignment, and the bulk
// operation used for confirm/verify/ignore/unassign. Pulled out here
// (rather than left inline in mutableSelect.jsx/gallery.jsx, which each
// had their own copy) so undo/redo in picasaScreen.jsx - which has no
// live Gallery/MutableSelect instance to call back into - can fire the
// exact same requests those components do.

export function assignFaceToPerson(faceId, personId) {
  const url = store.get('api_url') + '/faces/' + faceId + '/assign_face_to_person/';
  return withRetry(() => axiosInstance.patch(url, { declared_name_key: personId }));
}

export function bulkFaceOperation(actionType, faceIds, currentPersonId) {
  const url = store.get('api_url') + '/faces/bulk_operation/';
  return withRetry(() => axiosInstance.patch(url, {
    face_id_list: faceIds,
    operation: actionType,
    current_person_id: currentPersonId,
  }));
}
