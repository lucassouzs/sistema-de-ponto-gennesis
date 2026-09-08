'use client';

import { createContext, useContext, type ReactNode } from 'react';

type FlowHistoryContextValue = {
  commitBeforeMutation: () => void;
  beginInteraction: () => void;
  endInteraction: () => void;
  /** Usuário está arrastando seta a partir de um handle — esconde context pad. */
  connectionDragActive: boolean;
};

const FlowHistoryContext = createContext<FlowHistoryContextValue | null>(null);

export function FlowHistoryProvider({
  commitBeforeMutation,
  beginInteraction,
  endInteraction,
  connectionDragActive,
  children,
}: FlowHistoryContextValue & { children: ReactNode }) {
  return (
    <FlowHistoryContext.Provider
      value={{ commitBeforeMutation, beginInteraction, endInteraction, connectionDragActive }}
    >
      {children}
    </FlowHistoryContext.Provider>
  );
}

export function useFlowHistoryCommit() {
  return useContext(FlowHistoryContext)?.commitBeforeMutation ?? (() => {});
}

export function useFlowHistoryInteraction() {
  const ctx = useContext(FlowHistoryContext);
  return {
    beginInteraction: ctx?.beginInteraction ?? (() => {}),
    endInteraction: ctx?.endInteraction ?? (() => {}),
  };
}

export function useFlowConnectionDragActive() {
  return useContext(FlowHistoryContext)?.connectionDragActive ?? false;
}
