import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
  withCredentials: true,
});

let isRefreshing = false;
let subscribers = [];

function onRefreshed(token) {
  subscribers.forEach((cb) => cb(token));
  subscribers = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    // Only retry 401 if we have an authorization header (authenticated user)
    const hasAuth = original.headers.Authorization;
    if (err.response && err.response.status === 401 && !original._retry && hasAuth) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribers.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(axios(original));
          });
        });
      }
      isRefreshing = true;
      try {
        const r = await api.post('/auth/refresh');
        const { accessToken } = r.data;
        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        onRefreshed(accessToken);
        isRefreshing = false;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return axios(original);
      } catch (e) {
        isRefreshing = false;
        return Promise.reject(e);
      }
    }
    return Promise.reject(err);
  },
);

// Named export for modules that import { apiClient }
export const apiClient = api;

export default api;
