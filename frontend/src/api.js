// Base URL for the backend API, resolved at build time from VITE_API_URL
// (e.g. https://leatherstylish-backend.onrender.com for the live deploy).
// When unset it stays empty, keeping same-origin relative /api requests which the Vite
// dev proxy forwards to the local backend during development.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// ASSUMPTION-NEEDED: some deployed backend versions wrap list responses as
// { value: [...], Count: N } instead of a bare array. Normalize so list consumers
// always get an array regardless of which backend happens to be live.
export const unwrapArray = (data) =>
  Array.isArray(data) ? data : Array.isArray(data && data.value) ? data.value : [];