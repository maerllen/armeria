import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type TopAlertType = 'success' | 'error' | 'warning' | 'info';

export interface TopLayerAlertProps {
  type: TopAlertType;
  message: React.ReactNode;
  title?: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

interface GlobalAlertItem {
  id: number;
  type: TopAlertType;
  title?: string;
  message: string;
}

const GLOBAL_ALERT_EVENT = 'armeria:top-alert';

export function showTopAlert(
  message: string,
  type: TopAlertType = 'warning',
  title?: string,
  autoHideMs = 6000
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(GLOBAL_ALERT_EVENT, {
      detail: { message, type, title, autoHideMs }
    })
  );
}

function getOrCreateAlertHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById('top-layer-alert-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'top-layer-alert-root';
    host.className =
      'fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[10050] w-[calc(100%-1.25rem)] max-w-2xl flex flex-col gap-2.5 pointer-events-none print:hidden';
    document.body.appendChild(host);
  }
  return host;
}

export const TopLayerAlert: React.FC<TopLayerAlertProps> = ({
  type,
  message,
  title,
  onClose,
  actions
}) => {
  const [host, setHost] = useState<HTMLElement | null>(() => getOrCreateAlertHost());

  useEffect(() => {
    const el = getOrCreateAlertHost();
    if (el && el !== host) {
      setHost(el);
    }
  }, [host]);

  if (!message || !host) return null;

  const variantMeta: Record<
    TopAlertType,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    success: {
      label: title || 'Operação Concluída',
      className: 'top-layer-alert top-layer-alert-success',
      icon: <CheckCircle2 className="w-5 h-5 shrink-0" />
    },
    error: {
      label: title || 'Atenção / Erro',
      className: 'top-layer-alert top-layer-alert-error',
      icon: <AlertCircle className="w-5 h-5 shrink-0" />
    },
    warning: {
      label: title || 'Aviso Importante',
      className: 'top-layer-alert top-layer-alert-warning',
      icon: <AlertTriangle className="w-5 h-5 shrink-0" />
    },
    info: {
      label: title || 'Informação',
      className: 'top-layer-alert top-layer-alert-info',
      icon: <Info className="w-5 h-5 shrink-0" />
    }
  };

  const current = variantMeta[type] || variantMeta.info;

  return createPortal(
    <div
      role="alert"
      aria-live="assertive"
      className={`${current.className} pointer-events-auto rounded-2xl p-3.5 sm:p-4 shadow-2xl border-2 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-200`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="top-layer-alert-icon p-2 rounded-xl shrink-0 mt-0.5">
          {current.icon}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[11px] font-black uppercase tracking-wider opacity-95">
            {current.label}
          </div>
          <div className="text-xs sm:text-sm font-semibold leading-relaxed break-words whitespace-pre-line">
            {message}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              {actions}
            </div>
          )}
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar alerta"
          className="top-layer-alert-close p-1.5 rounded-lg shrink-0 transition"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>,
    host
  );
};

export const GlobalAlertHost: React.FC = () => {
  const [alerts, setAlerts] = useState<GlobalAlertItem[]>([]);

  useEffect(() => {
    let nextId = 1;
    const handleEvent = (e: Event) => {
      const custom = e as CustomEvent<{
        message: string;
        type?: TopAlertType;
        title?: string;
        autoHideMs?: number;
      }>;
      const detail = custom.detail;
      if (!detail?.message) return;

      const id = nextId++;
      const type = detail.type || 'warning';
      setAlerts(prev => [...prev, { id, type, title: detail.title, message: detail.message }]);

      const timeout = detail.autoHideMs ?? 6000;
      if (timeout > 0) {
        setTimeout(() => {
          setAlerts(prev => prev.filter(item => item.id !== id));
        }, timeout);
      }
    };

    window.addEventListener(GLOBAL_ALERT_EVENT, handleEvent);
    return () => window.removeEventListener(GLOBAL_ALERT_EVENT, handleEvent);
  }, []);

  return (
    <>
      {alerts.map(item => (
        <TopLayerAlert
          key={item.id}
          type={item.type}
          title={item.title}
          message={item.message}
          onClose={() => setAlerts(prev => prev.filter(a => a.id !== item.id))}
        />
      ))}
    </>
  );
};
