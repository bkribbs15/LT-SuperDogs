import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      verifyToken();
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async () => {
    try {
      const userData = await authAPI.getMe();
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Token verification failed:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const data = await authAPI.login({ email, password });
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const register = async (userData) => {
    try {
      const data = await authAPI.register(userData);
      return { success: true, message: data.message };
    } catch (error) {
      const detail = error.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((d) => d.msg).join(' ') : detail;
      return { success: false, error: msg || 'Registration failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (newUserData) => {
    const updated = { ...user, ...newUserData };
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  };

  const value = {
    user,
    login,
    register,
    logout,
    updateUser,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    isOwner: user?.is_owner || false,
    mustChangePassword: user?.must_change_password || false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
