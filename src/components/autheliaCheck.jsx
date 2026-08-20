import axiosInstance from './axios_setup';

// Background check of the *actual* Authelia session (independent of the
// Django backend's own cookie/session), used to catch the case where a
// user has logged out of the Authelia portal directly without the
// frontend noticing. Goes through the Django backend's own
// /authelia_state/ endpoint (which forwards cookies to Authelia's
// /api/verify server-side) rather than calling auth.exploretheworld.tech
// directly, since Authelia doesn't CORS-enable that check for
// cross-origin browser callers.
//
// Returns:
//   true  - Authelia confirms the session is authenticated
//   false - Authelia confirms the session is NOT authenticated
//   null  - the check itself failed (network/backend issue) - callers
//           should treat this as "unknown" and not bounce the user, since
//           a broken check is not the same as a confirmed logout.
const checkAutheliaSession = async () => {
  try {
    const response = await axiosInstance.get('/authelia_state/');
    console.log("Authelia session check:", response.data);
    if (typeof response.data.authenticated !== 'boolean') {
      return null;
    }
    return response.data.authenticated;
  } catch (error) {
    console.warn("Authelia session check failed - not treating as logged out", error);
    return null;
  }
};

export { checkAutheliaSession };
