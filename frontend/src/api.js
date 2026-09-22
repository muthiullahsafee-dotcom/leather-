// Base URL for the backend API, resolved at build time from VITE_API_URL
// (e.g. https://leatherstylish-backend.onrender.com for the live deploy).
// When unset it stays empty, keeping same-origin relative /api requests which the Vite
// dev proxy forwards to the local backend during development.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');