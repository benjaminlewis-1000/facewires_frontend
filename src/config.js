// Automatically detect if we are running in development mode (via Vite's mode or a flag)
const isDev = import.meta.env.DEV || import.meta.env.VITE_ENV === 'development';

// Smart auto-switching URLs
const FRONTEND_URL = isDev 
  ? "https://facewire_dev.exploretheworld.tech" 
  : "https://facewire.exploretheworld.tech";

const API_URL = "https://picasa.exploretheworld.tech/api";
const AUTHELIA_LOGIN_URL = "https://picasa.exploretheworld.tech/accounts/oidc/authelia/login/";
const AUTHELIA_LOGOUT_URL = "https://auth.exploretheworld.tech/logout";

export { isDev, FRONTEND_URL, API_URL, AUTHELIA_LOGIN_URL, AUTHELIA_LOGOUT_URL };