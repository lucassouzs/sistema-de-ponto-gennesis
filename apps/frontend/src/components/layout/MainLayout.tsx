'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  userRole: 'EMPLOYEE' | 'HR' | 'ADMIN';
  userName: string;
  onLogout: () => void;
}

export function MainLayout({ children, userRole, userName, onLogout }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Função para detectar mudanças no estado do menu
  const handleMenuToggle = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar 
        userRole={userRole} 
        userName={userName} 
        onLogout={onLogout}
        onMenuToggle={handleMenuToggle}
      />
      
      {/* Main Content */}
      <div className={`transition-all duration-300 ease-in-out ${
        isCollapsed ? 'lg:ml-20' : 'lg:ml-72'
      }`}>
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
