'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { ChatWidget } from '../chat/ChatWidget';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';

interface MainLayoutProps {
  children: React.ReactNode;
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
}

export function MainLayout({ children, userRole, userName, onLogout }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  /** Esconder o FAB de Conversas enquanto o modal de recorte de foto está aberto (mesmo ícone pode confundir). */
  const [hideConversasFabOverlay, setHideConversasFabOverlay] = useState(false);
  const pathname = usePathname();
  const { user } = usePermissions();

  useEffect(() => {
    const onFabVis = (e: Event) => {
      const detail = (e as CustomEvent<{ hidden?: boolean }>).detail;
      setHideConversasFabOverlay(!!detail?.hidden);
    };
    window.addEventListener('conversas-fab-visibility', onFabVis as EventListener);
    return () => window.removeEventListener('conversas-fab-visibility', onFabVis as EventListener);
  }, []);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['chat-unread-count', user?.id],
    queryFn: async () => {
      const res = await api.get('/chats/direct');
      const chats = (res.data?.data ?? []) as Array<{ messages?: Array<{ isRead: boolean; senderId: string }> }>;
      const total = chats.reduce((acc, chat) => {
        const unread = (chat.messages ?? []).filter(
          (m) => !m.isRead && m.senderId !== user?.id
        ).length;
        return acc + unread;
      }, 0);
      return total;
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  // Função para detectar mudanças no estado do menu
  const handleMenuToggle = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900">
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

      {/* Chat Widget */}
      <ChatWidget />

      {/* Atalho flutuante Conversas — oculto durante modal de recorte da foto (CircularPhotoCropModal) */}
      {pathname !== '/ponto/conversas' && !hideConversasFabOverlay && (
        <Link
          href="/ponto/conversas"
          className="fixed bottom-6 right-6 z-[51] flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700 lg:bottom-8 lg:right-8"
          aria-label="Abrir conversas"
          title="Conversas"
        >
          <MessageSquare className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-red-600 text-[11px] font-bold inline-flex items-center justify-center leading-none animate-chat-unread-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
      )}
    </div>
  );
}
