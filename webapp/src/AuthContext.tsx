import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from './types';

interface AuthContextValue {
  user: UserProfile | null;
  login: (userData: UserProfile) => void;
  signup: (userData: UserProfile) => void;
  logout: () => void;
  getToken: () => string | null;
  isAuthenticated: () => boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const logout = React.useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  const checkAuthStatus = React.useCallback(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const accessToken = localStorage.getItem('accessToken');

      if (storedUser && accessToken) {
        const userData = JSON.parse(storedUser) as UserProfile;
        setUser(userData);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = (userData: UserProfile) => {
    setUser(userData);
  };

  const signup = (userData: UserProfile) => {
    setUser(userData);
  };

  const getToken = () => localStorage.getItem('accessToken');

  const isAuthenticated = () => Boolean(user && localStorage.getItem('accessToken'));

  const value = useMemo<AuthContextValue>(() => ({
    user,
    login,
    signup,
    logout,
    getToken,
    isAuthenticated,
    loading
  }), [user, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
