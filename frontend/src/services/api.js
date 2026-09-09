import axios from 'axios';

// Dev backend runs on :8101 (the Masters pool owns :8000/:8001 on the Mac mini).
// Prod builds bake VITE_API_URL in via Dockerfile.prod.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8101';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 here means "bad credentials the user typed", not "session expired"
const CREDENTIAL_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/change-password'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isCredentialCheck = CREDENTIAL_ENDPOINTS.some((e) => url.includes(e));
    if (error.response?.status === 401 && !isCredentialCheck) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const data = (p) => p.then((r) => r.data);

export const authAPI = {
  register: (userData) => data(api.post('/api/auth/register', userData)),
  login: (credentials) => data(api.post('/api/auth/login', credentials)),
  forgotPassword: (email) => data(api.post('/api/auth/forgot-password', { email })),
  getMe: () => data(api.get('/api/auth/me')),
  changePassword: (currentPassword, newPassword) =>
    data(api.post('/api/auth/change-password', { current_password: currentPassword, new_password: newPassword })),
  updateProfile: (profileData) => data(api.put('/api/auth/profile', profileData)),
};

export const boardAPI = {
  getCurrent: () => data(api.get('/api/board')),
  getWeek: (week) => data(api.get(`/api/board/${week}`)),
};

export const picksAPI = {
  makePick: (gameId, teamId) => data(api.post('/api/picks', { game_id: gameId, team_id: teamId })),
  dropPick: () => data(api.delete('/api/picks/current')),
  getMine: (season) => data(api.get('/api/picks/mine', { params: season ? { season } : {} })),
  getWeek: (week, season) => data(api.get(`/api/picks/week/${week}`, { params: season ? { season } : {} })),
};

export const standingsAPI = {
  get: (season) => data(api.get('/api/standings', { params: season ? { season } : {} })),
  recap: (season) => data(api.get('/api/standings/recap', { params: season ? { season } : {} })),
  history: () => data(api.get('/api/standings/history')),
  share: () => data(api.get('/api/standings/share')),
};

export const publicAPI = {
  standings: (token) => data(api.get(`/api/public/standings/${token}`)),
};

export const adminAPI = {
  getAllUsers: () => data(api.get('/api/admin/users')),
  getPendingCount: () => data(api.get('/api/admin/users/pending-count')),
  approveUser: (userId) => data(api.post(`/api/admin/users/${userId}/approve`)),
  denyUser: (userId) => data(api.post(`/api/admin/users/${userId}/deny`)),
  toggleAdminStatus: (userId) => data(api.post(`/api/admin/users/${userId}/toggle-admin`)),
  toggleActiveStatus: (userId) => data(api.post(`/api/admin/users/${userId}/toggle-active`)),
  resetPassword: (userId, newPassword) =>
    data(api.post(`/api/admin/users/${userId}/reset-password`, { new_password: newPassword })),
  getResetRequests: () => data(api.get('/api/admin/reset-requests')),
  resolveResetRequest: (token, newPassword) =>
    data(api.post(`/api/admin/reset-requests/${token}/resolve`, { new_password: newPassword })),
  dismissResetRequest: (token) => data(api.post(`/api/admin/reset-requests/${token}/dismiss`)),

  getSeason: () => data(api.get('/api/admin/season')),
  updateSeason: (body) => data(api.put('/api/admin/season', body)),
  sync: (week) => data(api.post('/api/admin/sync', null, { params: week ? { week } : {} })),
  setSpread: (gameId, spread, favoriteTeamId) =>
    data(api.put(`/api/admin/games/${gameId}/spread`, { spread, favorite_team_id: favoriteTeamId })),
  setResult: (gameId, homeScore, awayScore) =>
    data(api.put(`/api/admin/games/${gameId}/result`, { home_score: homeScore, away_score: awayScore })),
  resolvePicks: (week) => data(api.post('/api/admin/picks/resolve', null, { params: week ? { week } : {} })),
  deletePick: (pickId) => data(api.delete(`/api/admin/picks/${pickId}`)),
  getPicks: (week) => data(api.get('/api/admin/picks', { params: week ? { week } : {} })),
  testEmail: () => data(api.post('/api/admin/notifications/test')),
  rotateShare: () => data(api.post('/api/admin/share/rotate')),
};

export default api;
