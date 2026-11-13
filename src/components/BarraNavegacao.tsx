import React from 'react';
import { User, DEFAULT_SYSTEM_LOGO } from '../types';
import { formatMasp } from '../utils/masks';
import { LogOut, KeyRound, Menu, X } from 'lucide-react';
import { ThemeToggle } from './AlternadorTema';
import { usePreloader } from '../context/PreloaderContext';
import { PreloaderNavbarIndicator } from './PreloaderGlobal';

import { storage } from '../services/storage';

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  onChangePasswordClick: () => void;
  onUserSwitched: () => void;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  logoUrl?: string;
  departmentName?: string;
  unitName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  onChangePasswordClick,
  onUserSwitched,
  isMobileMenuOpen,
  onToggleMobileMenu,
  logoUrl,
  departmentName,
  unitName
}) => {
  const { isLoading, message } = usePreloader();

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Geral':
        return 'bg-purple-950/80 text-purple-300 border-purple-500/50';
      case 'Administrador':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50';
      case 'Armeiro':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/50';
      case 'Explosivista':
        return 'bg-rose-950/80 text-rose-300 border-rose-500/50';
      case 'operador_canino':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50';
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-500/50';
    }
  };

  const activeLogo = (logoUrl && logoUrl.trim()) ? logoUrl.trim() : DEFAULT_SYSTEM_LOGO;

  return (
    <header className="glass border-b border-slate-800/80 text-slate-100 sticky top-0 z-30 shadow-2xl backdrop-blur-md pt-[env(safe-area-inset-top)] print:hidden">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        
        {/* Left: Hamburger (mobile only) + Brand Logo */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          {/* Mobile Menu Toggle Button */}
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-amber-400 hover:bg-slate-800/80 rounded-xl border border-slate-800 transition shrink-0"
              aria-label="Alternar Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5 text-amber-400" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <div className="shrink-0 flex items-center justify-center">
            <img
              src={activeLogo}
              alt="Logo do Sistema"
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain rounded-full bg-slate-950 p-0.5 border border-amber-500/40 shadow-md shadow-amber-500/10"
              onError={(e) => {
                // If custom logo fails to load, gracefully fallback to default
                if (e.currentTarget.src !== window.location.origin + DEFAULT_SYSTEM_LOGO) {
                  e.currentTarget.src = DEFAULT_SYSTEM_LOGO;
                }
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <span className="font-black text-base sm:text-xl tracking-wider text-slate-100 font-mono truncate">ARMARIA</span>
              <span className="hidden sm:inline-block text-[10px] bg-amber-500/10 text-amber-400 font-semibold px-2 py-0.5 rounded border border-amber-500/30 uppercase tracking-widest font-mono shrink-0">
                PCMG
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block font-sans truncate max-w-[320px]">
              Gestão de Materiais Bélicos {unitName ? `• ${unitName}` : departmentName ? `• ${departmentName}` : ''}
            </p>
          </div>
        </div>

        {/* Right: Theme, User info & Logout */}
        {currentUser && (
          <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">

            {/* Preloader Working Badge */}
            <PreloaderNavbarIndicator isActive={isLoading} label={message} />

            {/* Theme / Palette Switcher (Escura / Clara) */}
            <ThemeToggle showDropdown={true} compact={true} className="sm:hidden" />
            <ThemeToggle showDropdown={true} className="hidden sm:block" />

            {/* Current User Badge & Multi-Role Switcher */}
            <div className="flex items-center space-x-2.5 bg-slate-900/80 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-800/80 max-w-[130px] sm:max-w-none">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-100 truncate max-w-[150px]">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  MASP: {formatMasp(currentUser.masp)}
                </span>
              </div>

              {currentUser.roles && currentUser.roles.length > 1 ? (
                <div className="flex items-center space-x-1 bg-slate-950 px-1.5 sm:px-2 py-0.5 rounded-md border border-amber-500/40 min-w-0">
                  <span className="text-[9px] text-amber-400/80 font-mono font-bold uppercase hidden sm:inline">Perfil:</span>
                  <select
                    value={currentUser.activeRole || currentUser.role}
                    onChange={(e) => {
                      const newRole = e.target.value as any;
                      storage.switchActiveRole(newRole);
                      onUserSwitched();
                    }}
                    className="text-[10px] font-bold bg-transparent text-amber-400 border-0 uppercase font-mono tracking-wider focus:outline-none cursor-pointer truncate max-w-[96px] sm:max-w-none"
                    title="Alternar Perfil de Acesso do Usuário"
                  >
                    {currentUser.roles.map(r => (
                      <option key={r} value={r} className="bg-slate-900 text-slate-100 font-sans">
                        {r === 'operador_canino' ? 'Operador Canino' : r}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase font-mono tracking-wider truncate ${getRoleBadgeColor(currentUser.activeRole || currentUser.role)}`}>
                  {(currentUser.activeRole || currentUser.role) === 'operador_canino' ? 'Operador Canino' : (currentUser.activeRole || currentUser.role)}
                </span>
              )}
            </div>

            {/* Password Change Button */}
            <button
              onClick={onChangePasswordClick}
              className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-2 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 rounded-lg transition"
              title="Alterar Senha"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 flex items-center justify-center space-x-1.5 text-xs bg-red-950/60 hover:bg-red-900/80 text-red-300 px-2.5 sm:px-3 py-1.5 rounded-lg border border-red-800/50 transition shadow-sm"
              title="Sair do Sistema"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline font-medium">Sair</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

