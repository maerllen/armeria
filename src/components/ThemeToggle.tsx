import React, { useState, useRef, useEffect } from 'react';
import { useTheme, AppTheme } from '../context/ThemeContext';
import { Sun, Moon, Monitor, ChevronDown, Check } from 'lucide-react';

interface ThemeToggleProps {
  compact?: boolean;
  showDropdown?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  compact = false,
  showDropdown = false,
  className = ''
}) => {
  const { theme, toggleTheme, setTheme, isLight } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!showDropdown) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all duration-200 shadow-sm ${
          isLight
            ? 'bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50'
            : 'bg-slate-800/80 text-amber-400 border-slate-700/80 hover:bg-slate-700/80 hover:text-amber-300'
        } ${className}`}
        title={
          isLight
            ? 'Paleta Clara (Windows Desktop) ativada. Clique para alternar para a Paleta Escura.'
            : 'Paleta Escura ativada. Clique para alternar para a Paleta Clara (Windows Desktop).'
        }
        aria-label="Alternar Paleta do Sistema"
      >
        {isLight ? (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-600 animate-spin-slow" />
            {!compact && <span className="font-bold text-[11px]">Paleta Clara (Windows)</span>}
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-amber-400" />
            {!compact && <span className="font-bold text-[11px]">Paleta Escura</span>}
          </>
        )}
      </button>
    );
  }

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all duration-200 ${
          isLight
            ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
            : 'bg-slate-800/80 text-slate-200 border-slate-700/80 hover:bg-slate-700/80'
        }`}
        title="Seletor de Paleta do Sistema"
      >
        {isLight ? (
          <Sun className="w-3.5 h-3.5 text-amber-600" />
        ) : (
          <Moon className="w-3.5 h-3.5 text-amber-400" />
        )}
        {!compact && (
          <span className="font-bold text-[11px]">
            {isLight ? 'Clara (Windows)' : 'Escura'}
          </span>
        )}
        <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1 font-sans">
          <div className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 uppercase font-bold border-b border-slate-800 flex items-center justify-between">
            <span>Paleta do Sistema</span>
            <span className="text-[9px] text-amber-400 font-normal">Tema Visual</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition ${
              theme === 'dark'
                ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Moon className="w-4 h-4 text-amber-400" />
              <div>
                <p className="font-semibold text-xs leading-none">Paleta Escura</p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-normal">Padrão Tático Policial</p>
              </div>
            </div>
            {theme === 'dark' && <Check className="w-3.5 h-3.5 text-amber-400" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('light');
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition ${
              theme === 'light'
                ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Sun className="w-4 h-4 text-amber-500" />
              <div>
                <p className="font-semibold text-xs leading-none">Paleta Clara</p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-normal">Estilo Windows Desktop</p>
              </div>
            </div>
            {theme === 'light' && <Check className="w-3.5 h-3.5 text-amber-400" />}
          </button>
        </div>
      )}
    </div>
  );
};
