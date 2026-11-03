import React, { useState, useEffect } from 'react';
import { DEFAULT_SYSTEM_LOGO } from '../types';
import { Shield, Loader2, Sparkles, AlertCircle, X } from 'lucide-react';

interface PreloaderGlobalProps {
  isActive: boolean;
  message?: string;
  submessage?: string;
  type?: 'command' | 'sync' | 'module' | 'auth';
  logoUrl?: string;
  onDismiss?: () => void;
}

export const PreloaderGlobal: React.FC<PreloaderGlobalProps> = ({
  isActive,
  message = 'Processando comando...',
  submessage = 'Aguarde enquanto o sistema executa a operação...',
  type = 'command',
  logoUrl,
  onDismiss
}) => {
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setSecondsElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setSecondsElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  const activeLogo = logoUrl && logoUrl.trim() ? logoUrl.trim() : DEFAULT_SYSTEM_LOGO;

  const getTypeStyles = () => {
    switch (type) {
      case 'auth':
        return {
          badge: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
          ringOuter: 'border-purple-500/40 border-t-purple-400',
          ringInner: 'border-amber-500/40 border-b-amber-400',
          accent: 'text-purple-400',
          barGradient: 'from-purple-500 via-amber-400 to-purple-600'
        };
      case 'module':
        return {
          badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40',
          ringOuter: 'border-cyan-500/40 border-t-cyan-400',
          ringInner: 'border-emerald-500/40 border-b-emerald-400',
          accent: 'text-cyan-400',
          barGradient: 'from-cyan-500 via-blue-400 to-cyan-600'
        };
      case 'sync':
        return {
          badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
          ringOuter: 'border-emerald-500/40 border-t-emerald-400',
          ringInner: 'border-cyan-500/40 border-b-cyan-400',
          accent: 'text-emerald-400',
          barGradient: 'from-emerald-500 via-cyan-400 to-emerald-600'
        };
      case 'command':
      default:
        return {
          badge: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
          ringOuter: 'border-amber-500/40 border-t-amber-400',
          ringInner: 'border-cyan-500/40 border-b-cyan-400',
          accent: 'text-amber-400',
          barGradient: 'from-amber-500 via-amber-300 to-cyan-500'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <>
      {/* 1. Barra ultra-fina superior de progresso imediato */}
      <div className="fixed top-0 left-0 right-0 h-1 z-[9999] bg-slate-900/60 overflow-hidden pointer-events-none">
        <div
          className={`h-full bg-gradient-to-r ${styles.barGradient} animate-indeterminate shadow-[0_0_12px_rgba(245,158,11,0.8)]`}
        />
      </div>

      {/* 2. Modal Overlay Tático de Processamento de Comando */}
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-fadeIn"
        role="dialog"
        aria-modal="true"
        aria-label="Processando comando"
      >
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-sm sm:max-w-md w-full text-center relative overflow-hidden shadow-2xl shadow-black/80 animate-pulse-glow">
          
          {/* Efeito luminoso de fundo */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Botão de dispensa de emergência (caso demore mais de 5s) */}
          {secondsElapsed >= 5 && onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-100 p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition text-xs flex items-center space-x-1"
              title="Dispensar pré-carregamento"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Badge superior com indicador pulsante */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border mb-5 shadow-sm bg-slate-950/70 border-slate-700 text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="font-bold">ARMARIA • POLÍCIA CIVIL</span>
          </div>

          {/* Emblema com anéis táticos de rotação */}
          <div className="relative w-28 h-28 mx-auto mb-5 flex items-center justify-center">
            {/* Anel Externo Giratório */}
            <div
              className={`absolute inset-0 rounded-full border-2 border-dashed ${styles.ringOuter} animate-spin-slow`}
            />
            {/* Anel Interno Giratório Reverso */}
            <div
              className={`absolute inset-2 rounded-full border-2 border-t-transparent ${styles.ringInner} animate-spin-reverse`}
            />

            {/* Logo do Sistema Centralizada */}
            <div className="relative w-20 h-20 rounded-full bg-slate-950 p-1.5 shadow-xl border border-amber-500/40 flex items-center justify-center overflow-hidden">
              <img
                src={activeLogo}
                alt="Emblema PCMG"
                className="w-full h-full object-contain filter drop-shadow-md"
                onError={(e) => {
                  if (e.currentTarget.src !== window.location.origin + DEFAULT_SYSTEM_LOGO) {
                    e.currentTarget.src = DEFAULT_SYSTEM_LOGO;
                  }
                }}
              />
            </div>
          </div>

          {/* Mensagem Principal */}
          <div className="space-y-2 mb-6">
            <h3 className="text-lg sm:text-xl font-black text-slate-100 tracking-wide font-mono flex items-center justify-center space-x-2">
              <span>{message}</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 font-sans max-w-xs mx-auto leading-relaxed">
              {submessage}
            </p>
          </div>

          {/* Barra tática de progresso */}
          <div className="w-full bg-slate-950/90 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${styles.barGradient} animate-indeterminate shadow-[0_0_10px_rgba(245,158,11,0.5)]`}
            />
          </div>

          {/* Rodapé informativo discreto */}
          <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span className="flex items-center space-x-1">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              <span>Executando comando...</span>
            </span>
            {secondsElapsed > 0 && (
              <span>{secondsElapsed}s</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

/**
 * Indicador discreto em tempo real para a barra de navegação
 */
export const PreloaderNavbarIndicator: React.FC<{ isActive: boolean; label?: string }> = ({
  isActive,
  label = 'Processando...'
}) => {
  if (!isActive) return null;

  return (
    <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
};
