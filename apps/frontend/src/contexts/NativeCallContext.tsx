'use client';

import React, { createContext, useContext } from 'react';
import type { NativeCallHook } from '@/hooks/useNativeWebRTCCall';

const NativeCallContext = createContext<NativeCallHook | null>(null);

export function NativeCallProvider({
  value,
  children,
}: {
  value: NativeCallHook;
  children: React.ReactNode;
}) {
  return <NativeCallContext.Provider value={value}>{children}</NativeCallContext.Provider>;
}

export function useNativeCallContext(): NativeCallHook {
  const ctx = useContext(NativeCallContext);
  if (!ctx) {
    throw new Error('useNativeCallContext deve ser usado dentro de NativeCallProvider');
  }
  return ctx;
}
