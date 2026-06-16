// Replace the top line with:
const API_BASE = window.API_BASE_URL || (() => {
  const port = window.location.port;
  // If served directly from the FastAPI server on port 8000, use relative path
  if (!port || port === '8000') return '/api';
  // Otherwise talk to the backend explicitly
  return 'http://127.0.0.1:8000/api';
})();

async function request(method, path, body) {
  const options = {
    method,
    headers: { Accept: 'application/json' }
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch (_) { /* ignore parse errors */ }
    throw new Error(detail || `Request failed (${response.status})`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  delete: (path) => request('DELETE', path)
};

export async function checkApiHealth() {
  return api.get('/health');
}
