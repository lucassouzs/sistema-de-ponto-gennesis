/** URL do WebSocket de sinalização WebRTC (mesmo host da API, path `/ws/calls`). */
export function getWsCallsUrl(): string {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  try {
    const u = new URL(api);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws/calls';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return 'ws://localhost:5000/ws/calls';
  }
}
