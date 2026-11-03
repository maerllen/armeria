import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { preloaderService, PreloaderState } from '../services/preloaderService';
import { PreloaderGlobal } from '../components/PreloaderGlobal';
import { DEFAULT_SYSTEM_LOGO } from '../types';

interface PreloaderContextType {
  isLoading: boolean;
  message: string;
  submessage: string;
  type?: PreloaderState['type'];
  showPreloader: (message?: string, submessage?: string, type?: PreloaderState['type']) => string;
  hidePreloader: (taskId?: string) => void;
  withPreloader: <T>(
    operation: Promise<T> | (() => Promise<T>),
    message?: string,
    submessage?: string,
    type?: PreloaderState['type']
  ) => Promise<T>;
  setLogoUrl: (url?: string) => void;
}

const PreloaderContext = createContext<PreloaderContextType | undefined>(undefined);

export const PreloaderProvider: React.FC<{ children: React.ReactNode; defaultLogoUrl?: string }> = ({
  children,
  defaultLogoUrl
}) => {
  const [state, setState] = useState<PreloaderState>(() => preloaderService.getState());
  const [logoUrl, setLogoUrl] = useState<string>(defaultLogoUrl || DEFAULT_SYSTEM_LOGO);

  useEffect(() => {
    // Inscreve no serviço global para reagir tanto a chamadas do React quanto do fetch interceptor
    const unsubscribe = preloaderService.subscribe(newState => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  const showPreloader = useCallback((
    message = 'Processando comando...',
    submessage = 'Aguarde enquanto o sistema executa a operação...',
    type: PreloaderState['type'] = 'command'
  ) => {
    return preloaderService.start(message, submessage, type);
  }, []);

  const hidePreloader = useCallback((taskId?: string) => {
    if (taskId) {
      preloaderService.stop(taskId);
    } else {
      preloaderService.forceStop();
    }
  }, []);

  const withPreloader = useCallback(<T,>(
    operation: Promise<T> | (() => Promise<T>),
    message = 'Processando comando...',
    submessage = 'Aguarde enquanto o sistema executa a operação...',
    type: PreloaderState['type'] = 'command'
  ): Promise<T> => {
    return preloaderService.withPreloader(operation, message, submessage, type);
  }, []);

  const value = useMemo<PreloaderContextType>(() => ({
    isLoading: state.isActive,
    message: state.message,
    submessage: state.submessage,
    type: state.type,
    showPreloader,
    hidePreloader,
    withPreloader,
    setLogoUrl
  }), [state, showPreloader, hidePreloader, withPreloader]);

  return (
    <PreloaderContext.Provider value={value}>
      {children}
      <PreloaderGlobal
        isActive={state.isActive}
        message={state.message}
        submessage={state.submessage}
        type={state.type}
        logoUrl={logoUrl}
        onDismiss={() => preloaderService.forceStop()}
      />
    </PreloaderContext.Provider>
  );
};

export const usePreloader = (): PreloaderContextType => {
  const context = useContext(PreloaderContext);
  if (!context) {
    // Fallback caso usePreloader seja chamado fora do Provider
    return {
      isLoading: false,
      message: '',
      submessage: '',
      showPreloader: (msg, sub, t) => preloaderService.start(msg, sub, t),
      hidePreloader: (id) => (id ? preloaderService.stop(id) : preloaderService.forceStop()),
      withPreloader: (op, msg, sub, t) => preloaderService.withPreloader(op, msg, sub, t),
      setLogoUrl: () => {}
    };
  }
  return context;
};
