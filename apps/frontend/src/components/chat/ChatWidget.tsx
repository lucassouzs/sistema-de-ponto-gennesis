'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  MessageCircle, 
  X, 
  Send, 
  Paperclip, 
  Check, 
  XCircle,
  User,
  Building2,
  Download,
  FileText,
  Power,
  Search,
  MoreVertical,
  Image as ImageIcon,
  Smile,
  ArrowLeft,
  Archive,
  ChevronDown
} from 'lucide-react';
import api from '@/lib/api';

const DEPARTMENTS = [
  { value: 'Projetos', label: 'Projetos' },
  { value: 'Contratos e Licitações', label: 'Contratos e Licitações' },
  { value: 'Suprimentos', label: 'Suprimentos' },
  { value: 'Jurídico', label: 'Jurídico' },
  { value: 'Departamento Pessoal', label: 'Departamento Pessoal' },
  { value: 'Engenharia', label: 'Engenharia' },
  { value: 'Administrativo', label: 'Administrativo' },
  { value: 'Financeiro', label: 'Financeiro' },
];

/** `false` = esconde só o botão flutuante na tela; modal e lógica continuam no código. Para voltar a exibir, use `true`. */
const SHOW_CHAT_FLOAT_BUTTON = false;

interface Chat {
  id: string;
  initiatorId: string;
  recipientDepartment: string;
  status: 'PENDING' | 'ACCEPTED' | 'CLOSED';
  initiator?: {
    name: string;
    employee?: {
      department: string;
    };
  };
  accepter?: {
    name: string;
    employee?: {
      department: string;
    };
  };
  messages: Array<{
    id: string;
    senderId: string;
    content: string;
    isRead: boolean;
    createdAt: string;
    sender: {
      name: string;
      employee?: {
        department: string;
      };
    };
    attachments: Array<{
      id: string;
      fileName: string;
      fileUrl: string;
      fileSize: number | null;
    }>;
  }>;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'chat' | 'new'>('list');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [showClosedChats, setShowClosedChats] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  // Verificar se há token antes de fazer requisições
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('token');

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    enabled: hasToken, // Só executar se houver token
    retry: false, // Não tentar novamente em caso de erro
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  const userId = userData?.data?.id;

  // OTIMIZAÇÃO: Reduzir polling de 2-5s para 10-15s para reduzir carga no servidor
  const { data: pendingChatsResponse, refetch: refetchPendingChats } = useQuery({
    queryKey: ['chats-pending'],
    queryFn: async () => {
      const res = await api.get('/chats/pending');
      return res.data;
    },
    enabled: isOpen && !!userId,
    refetchInterval: 15000, // 15 segundos (era 5s)
    staleTime: 5000 // Cache por 5 segundos
  });

  const { data: activeChatsResponse, refetch: refetchActiveChats } = useQuery({
    queryKey: ['chats-active'],
    queryFn: async () => {
      const res = await api.get('/chats/active');
      return res.data;
    },
    enabled: isOpen && !!userId,
    refetchInterval: 12000, // 12 segundos (era 3s)
    staleTime: 5000 // Cache por 5 segundos
  });

  const { data: closedChatsResponse, refetch: refetchClosedChats } = useQuery({
    queryKey: ['chats-closed'],
    queryFn: async () => {
      const res = await api.get('/chats/closed');
      return res.data;
    },
    enabled: isOpen && !!userId && showClosedChats,
    refetchInterval: 12000, // 12 segundos (era 3s)
    staleTime: 5000 // Cache por 5 segundos
  });

  const { data: chatResponse, refetch: refetchChat } = useQuery({
    queryKey: ['chat', selectedChat?.id],
    queryFn: async () => {
      const res = await api.get(`/chats/${selectedChat?.id}`);
      return res.data;
    },
    enabled: !!selectedChat?.id && isOpen,
    refetchInterval: 10000, // 10 segundos (era 2s)
    staleTime: 3000 // Cache por 3 segundos
  });

  // OTIMIZAÇÃO: Reduzir polling de contadores
  const { data: unreadCountResponse } = useQuery({
    queryKey: ['chats-unread-count'],
    queryFn: async () => {
      const res = await api.get('/chats/unread/count');
      return res.data;
    },
    enabled: hasToken && !!userId, // Só executar se houver token e userId
    refetchInterval: 20000, // 20 segundos (era 10s)
    staleTime: 10000, // Cache por 10 segundos
    retry: false, // Não tentar novamente em caso de erro
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  const { data: pendingCountResponse } = useQuery({
    queryKey: ['chats-pending-count'],
    queryFn: async () => {
      const res = await api.get('/chats/pending/count');
      return res.data;
    },
    enabled: hasToken && !!userId, // Só executar se houver token e userId
    refetchInterval: 20000, // 20 segundos (era 10s)
    staleTime: 10000, // Cache por 10 segundos
    retry: false, // Não tentar novamente em caso de erro
    throwOnError: false // Não lançar erro - silenciar erros 401 esperados
  });

  const pendingChats: Chat[] = (pendingChatsResponse?.data || []).filter((chat: Chat) => chat.status === 'PENDING');
  const activeChats: Chat[] = activeChatsResponse?.data || [];
  const closedChats: Chat[] = closedChatsResponse?.data || [];
  const currentChat: Chat | null = chatResponse?.data || selectedChat;
  const unreadCount = unreadCountResponse?.data?.count || 0;
  const pendingCount = pendingCountResponse?.data?.count || 0;
  
  // Total de notificações: pendentes + não lidas
  const totalNotifications = pendingCount + unreadCount;

  // Garantir que currentChat tem messages como array e attachments em cada mensagem
  const safeCurrentChat = currentChat ? {
    ...currentChat,
    messages: (currentChat.messages || []).map(msg => ({
      ...msg,
      attachments: msg.attachments || []
    }))
  } : null;

  useEffect(() => {
    if (safeCurrentChat && safeCurrentChat.messages && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [safeCurrentChat?.messages]);

  // Forçar refetch quando o modal abrir
  useEffect(() => {
    if (isOpen && userId) {
      // Usar setTimeout para evitar setState durante render
      const timeoutId = setTimeout(() => {
        refetchActiveChats();
        refetchPendingChats();
        refetchClosedChats();
        if (selectedChat) {
          refetchChat();
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['chats-active'] });
    queryClient.invalidateQueries({ queryKey: ['chats-pending'] });
    queryClient.invalidateQueries({ queryKey: ['chats-closed'] });
    queryClient.invalidateQueries({ queryKey: ['chats-unread-count'] });
    if (selectedChat) {
      queryClient.invalidateQueries({ queryKey: ['chat', selectedChat.id] });
    }
    refetchActiveChats();
    refetchPendingChats();
    refetchClosedChats();
    if (selectedChat) {
      refetchChat();
    }
  };

  useEffect(() => {
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
      const scrollHeight = messageInputRef.current.scrollHeight;
      const minHeight = 40;
      const maxHeight = 96;
      messageInputRef.current.style.height = `${Math.max(minHeight, Math.min(scrollHeight, maxHeight))}px`;
    }
  }, [newMessage]);

  const handleOpenChat = (chat: Chat) => {
    setSelectedChat(chat);
    setActiveView('chat');
    if (chat.status === 'ACCEPTED') {
      api.patch(`/chats/${chat.id}/read`);
    }
  };

  const handleStartNewChat = () => {
    setActiveView('new');
    setSelectedDepartment('');
    setInitialMessage('');
    setSelectedFiles([]);
  };

  const handleCreateChat = async () => {
    if (!selectedDepartment || !initialMessage.trim()) {
      alert('Selecione um setor e digite uma mensagem');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('recipientDepartment', selectedDepartment);
      formData.append('initialMessage', initialMessage);
      selectedFiles.forEach((file) => {
        formData.append('attachments', file);
      });

      const res = await api.post('/chats', formData);

      // Invalidar e refetch imediatamente
      await queryClient.invalidateQueries({ queryKey: ['chats-active'] });
      await queryClient.invalidateQueries({ queryKey: ['chats-pending'] });
      refetchActiveChats();
      
      setActiveView('chat');
      setSelectedChat(res.data.data);
      setSelectedDepartment('');
      setInitialMessage('');
      setSelectedFiles([]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao criar chat');
    }
  };

  const handleAcceptChat = async (chatId: string) => {
    try {
      await api.post(`/chats/${chatId}/accept`);
      
      // Invalidar todas as queries relacionadas
      await queryClient.invalidateQueries({ queryKey: ['chats-active'] });
      await queryClient.invalidateQueries({ queryKey: ['chats-pending'] });
      await queryClient.invalidateQueries({ queryKey: ['chats-pending-count'] });
      await queryClient.invalidateQueries({ queryKey: ['chats-unread-count'] });
      
      // Refetch imediato
      await refetchActiveChats();
      await refetchPendingChats();
      
      // Buscar o chat atualizado e abrir
      const chat = [...activeChats, ...pendingChats].find(c => c.id === chatId);
      if (chat) {
        // Atualizar o status do chat localmente
        const updatedChat = { ...chat, status: 'ACCEPTED' as const };
        handleOpenChat(updatedChat);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao aceitar chat');
    }
  };

  const handleRejectChat = async (chatId: string) => {
    if (!confirm('Tem certeza que deseja rejeitar esta conversa?')) return;

    try {
      await api.delete(`/chats/${chatId}/reject`);
      queryClient.invalidateQueries({ queryKey: ['chats-pending'] });
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao rejeitar chat');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;
    if (!safeCurrentChat) return;

    try {
      const formData = new FormData();
      formData.append('chatId', safeCurrentChat.id);
      formData.append('content', newMessage);
      selectedFiles.forEach((file) => {
        formData.append('attachments', file);
      });

      await api.post('/chats/messages', formData);

      setNewMessage('');
      setSelectedFiles([]);
      refetchChat();
      refetchActiveChats();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao enviar mensagem');
    }
  };

  const handleCloseChat = async () => {
    if (!safeCurrentChat) return;
    if (!confirm('Tem certeza que deseja encerrar esta conversa?')) return;

    try {
      await api.patch(`/chats/${safeCurrentChat.id}/close`);
      queryClient.invalidateQueries({ queryKey: ['chats-active'] });
      setActiveView('list');
      setSelectedChat(null);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao encerrar chat');
    }
  };



  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Lista de emojis populares
  const emojis = [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
    '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
    '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳',
    '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫',
    '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳',
    '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭',
    '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧',
    '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👏', '🙌',
    '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶'
  ];

  const handleEmojiClick = (emoji: string) => {
    const input = messageInputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const text = newMessage.substring(0, start) + emoji + newMessage.substring(end);
      setNewMessage(text);
      
      // Reposicionar o cursor após o emoji
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    }
    setShowEmojiPicker(false);
  };

  // Fechar emoji picker ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Fechar conversa ao pressionar Esc
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Se houver emoji picker aberto, fechar ele primeiro
        if (showEmojiPicker) {
          setShowEmojiPicker(false);
          return;
        }
        // Se estiver visualizando uma conversa, fechar e voltar para a lista
        if (activeView === 'chat' && selectedChat) {
          setActiveView('list');
          setSelectedChat(null);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeView, selectedChat, showEmojiPicker]);

  const getChatTitle = (chat: Chat) => {
    if (chat.initiatorId === userId) {
      return chat.recipientDepartment;
    }
    return chat.initiator?.name || 'Desconhecido';
  };

  const getChatHeaderInfo = (chat: Chat) => {
    if (chat.initiatorId === userId) {
      // Se eu iniciei, mostrar quem aceitou ou o setor
      if (chat.accepter) {
        return {
          name: chat.accepter.name,
          department: chat.accepter.employee?.department || chat.recipientDepartment
        };
      }
      return {
        name: chat.recipientDepartment,
        department: ''
      };
    } else {
      // Se eu recebi, mostrar quem iniciou
      return {
        name: chat.initiator?.name || 'Desconhecido',
        department: chat.initiator?.employee?.department || ''
      };
    }
  };

  const getDepartmentInitials = (department: string) => {
    // Normalizar para comparação (ignorar case e acentos)
    const normalize = (str: string) => str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    const dept = DEPARTMENTS.find(d => 
      normalize(d.value) === normalize(department) || 
      normalize(d.label) === normalize(department)
    );
    
    if (!dept) {
      // Se não encontrar, tenta pegar as iniciais do nome original
      const words = department.split(' ');
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return department.substring(0, 2).toUpperCase();
    }
    // Para setores com mais de uma palavra, pega a primeira letra de cada palavra
    const words = dept.label.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return dept.label.substring(0, 2).toUpperCase();
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const filteredActiveChats = activeChats.filter(chat => {
    if (!searchQuery) return true;
    const title = getChatTitle(chat).toLowerCase();
    const lastMsg = chat.messages[chat.messages.length - 1]?.content.toLowerCase() || '';
    return title.includes(searchQuery.toLowerCase()) || lastMsg.includes(searchQuery.toLowerCase());
  });

  const filteredPendingChats = pendingChats.filter(chat => {
    if (!searchQuery) return true;
    const title = getChatTitle(chat).toLowerCase();
    const lastMsg = chat.messages[0]?.content.toLowerCase() || '';
    return title.includes(searchQuery.toLowerCase()) || lastMsg.includes(searchQuery.toLowerCase());
  });

  const filteredClosedChats = closedChats.filter(chat => {
    if (!searchQuery) return true;
    const headerInfo = getChatHeaderInfo(chat);
    const title = headerInfo.name.toLowerCase();
    const lastMsg = chat.messages && chat.messages.length > 0 ? chat.messages[0]?.content.toLowerCase() || '' : '';
    return title.includes(searchQuery.toLowerCase()) || lastMsg.includes(searchQuery.toLowerCase());
  });


  return (
    <>
      {/* Botão Flutuante — visível só se SHOW_CHAT_FLOAT_BUTTON */}
      {SHOW_CHAT_FLOAT_BUTTON && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-red-600 text-white rounded-full shadow-2xl hover:bg-red-700 hover:scale-110 transition-all duration-300 z-50 flex items-center justify-center group"
          style={{
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.4)',
          }}
        >
          <MessageCircle className="w-6 h-6 transition-transform" />
          {totalNotifications > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg animate-chat-unread-badge">
              {totalNotifications > 9 ? '9+' : totalNotifications}
            </span>
          )}
        </button>
      )}

      {/* Modal de Chat */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-50 flex items-center justify-center p-3 md:p-4 lg:p-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100%-1.5rem)] md:w-[calc(100%-2rem)] lg:w-full max-w-7xl h-[calc(100vh-1.5rem)] md:h-[calc(100vh-2rem)] lg:h-[90vh] flex overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Sidebar - Lista de Conversas */}
            <div className={`${activeView === 'chat' || activeView === 'new' ? 'hidden' : 'flex'} lg:flex w-full lg:w-80 border-r border-gray-200 dark:border-gray-700 flex-col bg-white dark:bg-gray-800`}>
              {/* Header Sidebar */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
                    Conversas
                  </h2>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleStartNewChat}
                      className="w-7 h-7 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-center transition-colors flex-shrink-0"
                      title="Nova conversa"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square-pen">
                        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="w-7 h-7 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-center transition-colors flex-shrink-0"
                      title="Fechar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Busca */}
                <div className="relative flex-shrink-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 focus:bg-white dark:focus:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400"
                  />
                </div>
              </div>

              {/* Título "Conversas Encerradas" - Aparece abaixo da linha de borda quando expandido */}
              <div 
                className={`border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800 overflow-hidden transition-all duration-500 ease-in-out ${
                  showClosedChats 
                    ? 'opacity-100 translate-y-0 max-h-20' 
                    : 'opacity-0 -translate-y-full max-h-0'
                }`}
              >
                <div className="px-4 py-2">
                  <button
                    onClick={() => {
                      setShowClosedChats(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">Conversas Encerradas</span>
                      {filteredClosedChats.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">({filteredClosedChats.length})</span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-300 rotate-180" />
                  </button>
                </div>
              </div>

              {/* Lista de Conversas */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Área de Scroll - Conversas Ativas e Pendentes */}
                <div 
                  className={`flex-1 overflow-y-auto transition-all duration-500 ease-in-out ${
                    showClosedChats 
                      ? 'opacity-0 translate-y-[-20px] pointer-events-none hidden' 
                      : 'opacity-100 translate-y-0 pointer-events-auto'
                  }`}
                >
                  {/* Chats Pendentes */}
                  {filteredPendingChats.length > 0 && (
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Pendentes ({filteredPendingChats.length})
                      </h3>
                      <div className="space-y-1.5">
                        {filteredPendingChats.map((chat) => {
                          const headerInfo = getChatHeaderInfo(chat);
                          return (
                            <div
                              key={chat.id}
                              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
                            >
                              <div className="flex items-start gap-3 mb-2">
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-red-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-semibold text-red-500">
                                    {(() => {
                                      const parts = headerInfo.name.trim().split(/\s+/);
                                      if (parts.length >= 2) {
                                        return (parts[0][0] + parts[1][0]).toUpperCase();
                                      }
                                      return headerInfo.name.substring(0, 2).toUpperCase();
                                    })()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {headerInfo.name}
                                  </h4>
                                </div>
                              </div>
                              {chat.messages[0] && (
                                <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                                  {chat.messages[0].content}
                                </p>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptChat(chat.id);
                                  }}
                                  className="flex-1 px-3 py-1.5 bg-green-600 dark:bg-green-500 text-white text-xs font-medium rounded hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
                                >
                                  Aceitar
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRejectChat(chat.id);
                                  }}
                                  className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-medium rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                                >
                                  Rejeitar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Chats Ativos */}
                  <div className="px-4 py-2 pt-1">
                    {filteredActiveChats.length === 0 && filteredPendingChats.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma conversa ativa</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredActiveChats.map((chat) => {
                          const lastMessage = chat.messages[chat.messages.length - 1];
                          const unreadCount = chat.messages.filter(m => !m.isRead && m.senderId !== userId).length;
                          const isSelected = selectedChat?.id === chat.id;
                          const isPending = chat.status === 'PENDING';
                          const isMyChat = chat.initiatorId === userId;
                          
                          const headerInfo = getChatHeaderInfo(chat);
                          
                          return (
                            <div
                              key={chat.id}
                              onClick={() => handleOpenChat(chat)}
                              className={`px-3 py-2.5 cursor-pointer transition-colors group border-l-2 ${
                                isSelected
                                  ? 'bg-gray-50 dark:bg-gray-700/50 border-red-600 dark:border-red-500'
                                  : isPending && isMyChat
                                  ? 'bg-yellow-50/50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-500'
                                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-red-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-semibold text-red-500">
                                    {(() => {
                                      const parts = headerInfo.name.trim().split(/\s+/);
                                      if (parts.length >= 2) {
                                        return (parts[0][0] + parts[1][0]).toUpperCase();
                                      }
                                      return headerInfo.name.substring(0, 2).toUpperCase();
                                    })()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h4 className={`text-sm truncate ${isSelected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                                        {headerInfo.name}
                                      </h4>
                                      {lastMessage && (
                                        <p className={`text-xs truncate mt-0.5 ${isSelected ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                          {lastMessage.content}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {lastMessage && (
                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                          {formatTime(lastMessage.createdAt)}
                                        </span>
                                      )}
                                      {unreadCount > 0 && (
                                        <span className="bg-red-600 text-white text-[10px] font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
                                          {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Área de Scroll - Conversas Encerradas */}
                <div 
                  className={`absolute inset-0 flex-1 overflow-y-auto transition-all duration-500 ease-in-out ${
                    showClosedChats 
                      ? 'opacity-100 translate-y-0 pointer-events-auto' 
                      : 'opacity-0 translate-y-[20px] pointer-events-none hidden'
                  }`}
                >
                  <div className="px-4 py-2">
                    {filteredClosedChats.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma conversa encerrada</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredClosedChats.map((chat) => {
                          const messagesArray = Array.isArray(chat.messages) ? chat.messages : [];
                          const lastMessage = messagesArray.length > 0 ? messagesArray[0] : null;
                          const isSelected = selectedChat?.id === chat.id;
                          const headerInfo = getChatHeaderInfo(chat);
                          
                          return (
                            <div
                              key={chat.id}
                              onClick={() => handleOpenChat(chat)}
                              className={`px-3 py-2.5 cursor-pointer transition-colors group border-l-2 ${
                                isSelected
                                  ? 'bg-gray-50 dark:bg-gray-700/50 border-red-600 dark:border-red-500'
                                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-red-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-semibold text-red-500">
                                    {(() => {
                                      const parts = headerInfo.name.trim().split(/\s+/);
                                      if (parts.length >= 2) {
                                        return (parts[0][0] + parts[1][0]).toUpperCase();
                                      }
                                      return headerInfo.name.substring(0, 2).toUpperCase();
                                    })()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h4 className={`text-sm truncate ${isSelected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                                        {headerInfo.name}
                                      </h4>
                                      {lastMessage && lastMessage.content && (
                                        <p className={`text-xs truncate mt-0.5 ${isSelected ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                          {lastMessage.content}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {lastMessage && lastMessage.createdAt && (
                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                          {formatTime(lastMessage.createdAt)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Botão para Mostrar Conversas Encerradas - Fixo na parte inferior quando fechado */}
                {!showClosedChats && (
                  <div className="absolute bottom-0 left-0 right-0 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
                    <button
                      onClick={() => {
                        setShowClosedChats(true);
                        refetchClosedChats();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Archive className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <span className="font-medium text-gray-700 dark:text-gray-300">Conversas Encerradas</span>
                        {filteredClosedChats.length > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">({filteredClosedChats.length})</span>
                        )}
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-300" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Área Principal - Chat ou Nova Conversa */}
            <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
              {activeView === 'new' && (
                <div className="flex-1 flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nova Conversa</h2>
                  </div>

                  {/* Formulário */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-xl mx-auto space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Setor <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={selectedDepartment}
                          onChange={(e) => setSelectedDepartment(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Selecione um setor...</option>
                          {DEPARTMENTS.map(dept => (
                            <option key={dept.value} value={dept.value}>
                              {dept.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Assunto <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={initialMessage}
                          onChange={(e) => setInitialMessage(e.target.value)}
                          rows={6}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 resize-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400 bg-white dark:bg-gray-700"
                          placeholder="Digite o assunto da conversa..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Anexos
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2 text-gray-700 dark:text-gray-300"
                        >
                          <Paperclip className="w-4 h-4" />
                          <span className="text-sm">Anexar arquivos</span>
                        </button>
                        {selectedFiles.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {selectedFiles.map((file, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600"
                              >
                                <div className="flex items-center space-x-2 flex-1 min-w-0">
                                  <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                                    {file.name}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                    ({(file.size / 1024).toFixed(1)} KB)
                                  </span>
                                </div>
                                <button
                                  onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex space-x-3 pt-2">
                        <button
                          onClick={() => setActiveView('list')}
                          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleCreateChat}
                          disabled={!selectedDepartment || !initialMessage.trim()}
                          className="flex-1 px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'chat' && safeCurrentChat && (
                <>
                  {/* Header do Chat */}
                  <div 
                    className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-red-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-red-500">
                          {(() => {
                            const headerInfo = getChatHeaderInfo(safeCurrentChat);
                            const parts = headerInfo.name.trim().split(/\s+/);
                            if (parts.length >= 2) {
                              return (parts[0][0] + parts[1][0]).toUpperCase();
                            }
                            return headerInfo.name.substring(0, 2).toUpperCase();
                          })()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const headerInfo = getChatHeaderInfo(safeCurrentChat);
                          return (
                            <>
                              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                                {headerInfo.name}
                              </h3>
                              {headerInfo.department && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {headerInfo.department}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {safeCurrentChat.status === 'ACCEPTED' && (
                        <button
                          onClick={handleCloseChat}
                          className="text-gray-400 dark:text-gray-500 hover:text-orange-600 dark:hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 p-1.5 rounded transition-colors"
                          title="Encerrar"
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Área de Mensagens */}
                  <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
                    {!safeCurrentChat.messages || safeCurrentChat.messages.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                          <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma mensagem ainda</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 max-w-3xl mx-auto">
                        {safeCurrentChat.messages.map((message, index) => {
                          const isOwn = message.senderId === userId;
                          const prevMessage = index > 0 ? safeCurrentChat.messages[index - 1] : null;
                          const nextMessage = index < safeCurrentChat.messages.length - 1 ? safeCurrentChat.messages[index + 1] : null;
                          const showDate = !prevMessage || 
                            new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();
                          const showTime = !nextMessage || 
                            new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime() > 300000;
                          
                          return (
                            <React.Fragment key={message.id}>
                              {showDate && (
                                <div className="flex items-center justify-center my-4">
                                  <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded">
                                    {new Date(message.createdAt).toLocaleDateString('pt-BR', {
                                      day: 'numeric',
                                      month: 'short'
                                    })}
                                  </div>
                                </div>
                              )}
                              <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex items-end space-x-2 max-w-[75%] ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                  {!isOwn && (
                                    <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white dark:text-gray-200 text-[10px] font-medium flex-shrink-0 mb-0.5">
                                      {message.sender.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                    {!isOwn && (
                                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-0.5 px-1 block">
                                        {message.sender.name}
                                      </span>
                                    )}
                                    <div
                                      className={`rounded-lg px-3 py-2 ${
                                        isOwn
                                          ? 'bg-red-600 dark:bg-red-500 text-white'
                                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                                      }`}
                                    >
                                      <div className="text-sm whitespace-pre-wrap break-words">
                                        {message.content}
                                      </div>
                                      {message.attachments && message.attachments.length > 0 && (
                                        <div className="mt-2 space-y-1.5">
                                          {message.attachments.map((att) => (
                                            <a
                                              key={att.id}
                                              href={att.fileUrl || '#'}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className={`flex items-center space-x-2 p-2 rounded text-sm ${
                                                isOwn
                                                  ? 'bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 text-white'
                                                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                                              }`}
                                            >
                                              <FileText className="w-4 h-4 flex-shrink-0" />
                                              <span className="truncate flex-1">{att.fileName}</span>
                                              <Download className="w-3 h-3 flex-shrink-0" />
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    {showTime && (
                                      <div className={`flex items-center space-x-1 mt-0.5 px-1 ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                          {new Date(message.createdAt).toLocaleTimeString('pt-BR', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </span>
                                        {isOwn && (
                                          <span className="text-[10px]">
                                            {message.isRead ? (
                                              <span className="text-blue-600 dark:text-blue-400">✓✓</span>
                                            ) : (
                                              <span className="text-gray-400 dark:text-gray-500">✓</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Input de Mensagem */}
                  {safeCurrentChat.status === 'ACCEPTED' && (
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      {selectedFiles.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {selectedFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center space-x-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded text-xs"
                            >
                              <FileText className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                              <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                                {file.name}
                              </span>
                              <button
                                onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors flex-shrink-0 flex items-center justify-center"
                          title="Anexar arquivo"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <div className="relative" ref={emojiPickerRef}>
                          <button
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors flex-shrink-0 flex items-center justify-center"
                            title="Adicionar emoji"
                          >
                            <Smile className="w-5 h-5" />
                          </button>
                          {showEmojiPicker && (
                            <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 max-h-64 overflow-y-auto w-64">
                              <div className="grid grid-cols-8 gap-1">
                                {emojis.map((emoji, index) => (
                                  <button
                                    key={index}
                                    onClick={() => handleEmojiClick(emoji)}
                                    className="text-xl p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center"
                                    title={emoji}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 relative">
                          <textarea
                            ref={messageInputRef}
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                              }
                            }}
                            placeholder="Digite sua mensagem..."
                            rows={1}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none max-h-24 overflow-y-auto text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400"
                            style={{ minHeight: '40px', maxHeight: '96px', lineHeight: '1.4' }}
                          />
                        </div>
                        <button
                          onClick={handleSendMessage}
                          disabled={!newMessage.trim() && selectedFiles.length === 0}
                          className="bg-red-600 dark:bg-red-500 text-white p-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center"
                          title="Enviar mensagem"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {safeCurrentChat.status === 'PENDING' && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800 text-center">
                      <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                        Aguardando aceitação do setor destinatário
                      </p>
                    </div>
                  )}

                  {safeCurrentChat.status === 'CLOSED' && (
                    <div className="p-4 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center">
                      <p className="text-gray-600 dark:text-gray-400 text-sm">
                        Esta conversa foi encerrada
                      </p>
                    </div>
                  )}
                </>
              )}

              {activeView === 'list' && !selectedChat && (
                <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
                  <div className="text-center">
                    <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Selecione uma conversa ou inicie uma nova
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
