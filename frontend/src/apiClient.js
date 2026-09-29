// Thin fetch wrapper so every screen handles errors the same way.
//
// A non-2xx response is turned into a thrown Error carrying the backend's own
// message, so forms can show "Order SO-0004 is already invoiced as INV-0007" instead
// of a bare "Request failed". List responses are normalized to arrays.
import { API_BASE, unwrapArray } from './api.js';

const parse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

export const get = (path) => fetch(API_BASE + path).then(parse);

export const getList = (path) => get(path).then(unwrapArray);

export const send = (method, path, body) =>
  fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(parse);

export const post = (path, body) => send('POST', path, body);
export const put = (path, body) => send('PUT', path, body);
export const patch = (path, body) => send('PATCH', path, body);
export const del = (path) => send('DELETE', path);
