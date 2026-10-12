import React, { createContext, useState, useEffect } from 'react';
import api from '../api/axiosInstance';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('smartqueue_token');
    const storedUser = localStorage.getItem('smartqueue_user');
    
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
        
        // Verify token is still valid by making a request
        api.get('/users/permissions', {
          headers: { Authorization: `Bearer ${storedToken}` },
        }).then(({ data }) => {
          setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
        }).catch(() => {
          // Token expired or invalid, clear everything
          localStorage.removeItem('smartqueue_token');
          localStorage.removeItem('smartqueue_user');
          setToken(null);
          setUser(null);
          setPermissions([]);
          delete api.defaults.headers.common.Authorization;
        }).finally(() => {
          setLoading(false);
        });
      } catch (err) {
        // JSON parse error or other issue, clear storage
        localStorage.removeItem('smartqueue_token');
        localStorage.removeItem('smartqueue_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      localStorage.setItem('smartqueue_token', token);
    } else {
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem('smartqueue_token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('smartqueue_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('smartqueue_user');
    }
  }, [user]);

  const login = async ({ username, password, rememberMe }) => {
    const res = await api.post('/auth/login', { username, password, rememberMe });
    const { accessToken, user } = res.data;
    const permissionResponse = await api.get('/users/permissions', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setUser(user);
    setToken(accessToken);
    setPermissions(Array.isArray(permissionResponse.data.permissions) ? permissionResponse.data.permissions : []);
    return user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setToken(null);
      setPermissions([]);
      localStorage.removeItem('smartqueue_token');
      localStorage.removeItem('smartqueue_user');
    }
  };

  return <AuthContext.Provider value={{ user, login, logout, token, setToken, permissions, loading }}>{children}</AuthContext.Provider>;
};
