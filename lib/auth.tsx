'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from './types';
import { memoryStore } from './store';

interface AuthContextType {
  currentUser: User | null;
  activeRole: 'senior' | 'buyer' | 'guardian';
  switchRole: (role: 'senior' | 'buyer' | 'guardian') => void;
  sendMockOtp: (phone: string) => Promise<{ success: boolean; mockOtp: string }>;
  verifyMockOtp: (phone: string, otp: string, role: 'senior' | 'buyer' | 'guardian', name: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: memoryStore.users[0],
  activeRole: 'senior',
  switchRole: () => {},
  sendMockOtp: async () => ({ success: true, mockOtp: '123456' }),
  verifyMockOtp: async () => true,
  logout: () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(memoryStore.users[0]);
  const [activeRole, setActiveRole] = useState<'senior' | 'buyer' | 'guardian'>('senior');

  // Load active user session from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('silverhands_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setCurrentUser(parsed);
          setActiveRole(parsed.role || 'senior');
        } catch (e) {
          console.warn('[Auth] Failed parsing saved user:', e);
        }
      }
    }
  }, []);

  const switchRole = (role: 'senior' | 'buyer' | 'guardian') => {
    setActiveRole(role);
    const targetUser = memoryStore.users.find(u => u.role === role) || {
      id: `usr-${role}-${Date.now()}`,
      name: role === 'senior' ? 'Savitri Devi' : (role === 'guardian' ? 'Vikram Devi (Guardian)' : 'Aarav Mehta'),
      phone: '+91 98765 43210',
      role,
      language_pref: 'hi'
    };
    setCurrentUser(targetUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem('silverhands_user', JSON.stringify(targetUser));
    }
  };

  const sendMockOtp = async (phone: string) => {
    // Generate deterministic 6-digit mock OTP for seamless testing
    const mockOtp = '424242';
    console.log(`[Mock SMS Gateway] OTP sent to ${phone}: ${mockOtp}`);
    return { success: true, mockOtp };
  };

  const verifyMockOtp = async (phone: string, otp: string, role: 'senior' | 'buyer' | 'guardian', name: string) => {
    if (otp === '424242' || otp.length === 6) {
      const newUser: User = {
        id: `usr-${Date.now()}`,
        name: name || (role === 'senior' ? 'Senior Elder' : role === 'guardian' ? 'Guardian Member' : 'Local Buyer'),
        phone,
        role,
        language_pref: 'hi'
      };
      memoryStore.users.push(newUser);
      setCurrentUser(newUser);
      setActiveRole(role);
      if (typeof window !== 'undefined') {
        localStorage.setItem('silverhands_user', JSON.stringify(newUser));
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('silverhands_user');
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, activeRole, switchRole, sendMockOtp, verifyMockOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
