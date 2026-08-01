import React, { useState } from 'react';
import { User } from '../types';
import { formatMasp } from '../utils/masks';
import { Shield, LogOut, KeyRound, Smartphone, Monitor, Menu, X, ChevronDown } from 'lucide-react';
import { DeviceInfo, DeviceMode } from '../utils/deviceDetection';

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  onChangePasswordClick: () => void;
  onUserSwitched: () => void;
  deviceInfo?: DeviceInfo;
  onSetDeviceMode?: (mode: DeviceMode) => void;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  onChangePasswordClick,
  deviceInfo,
  onSetDeviceMode,
  isMobileMenuOpen,
  onToggleMobileMenu
}) => {
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Geral':
        return 'bg-purple-950/80 text-purple-300 border-purple-500/50';
      case 'Administrador':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50';
      case 'Armeiro':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/50';
      default:
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50';
    }
  };

  const isMobile = deviceInfo?.isMobile ?? false;

  return (
    <header className="glass border-b border-slate-800/80 text-slate-100 sticky top-0 z-30 shadow-2xl backdrop-blur-md print:hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Hamburger (mobile only) + Brand Logo */}
        <div className="flex items-center space-x-3">
          {/* Mobile Menu Toggle Button */}
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800/80 rounded-xl border border-slate-800 transition"
              aria-label="Alternar Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5 text-amber-400" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <div className="bg-amber-500 p-2 rounded-xl text-slate-950 font-bold shadow-lg shadow-amber-500/20 neon-border flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-lg sm:text-xl tracking-wider text-slate-100 font-mono">ARMERIA</span>
              <span className="text-[9px] sm:text-[10px] bg-amber-500/10 text-amber-400 font-semibold px-2 py-0.5 rounded border border-amber-500/30 uppercase tracking-widest font-mono">
                POLÍCIA CIVIL
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block font-sans">
              Sistema de gerencia de material bélico da COE
            </p>
          </div>
        </div>

        {/* Right: Device Indicator + User info & Logout */}
        {currentUser && (
          <div className="flex items-center space-x-2 sm:space-x-3">

            {/* Device Detection Indicator & Mode Switcher */}
            {deviceInfo && onSetDeviceMode && (
              <div className="relative">
                <button
                  onClick={() => setShowDeviceMenu(!showDeviceMenu)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-medium border transition ${
                    isMobile
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
                  }`}
                  title="Detecção de Dispositivo"
                >
                  {isMobile ? (
                    <>
                      <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-bold">Celular</span>
                    </>
                  ) : (
                    <>
                      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-[11px] font-bold hidden sm:inline">Computador</span>
                      <span className="text-[11px] font-bold sm:hidden">PC</span>
                    </>
                  )}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {/* Device Selector Popover */}
                {showDeviceMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1">
                    <div className="px-2 py-1 text-[10px] font-mono text-slate-400 uppercase font-bold border-b border-slate-800">
                      Layout do Dispositivo
                    </div>
                    <button
                      onClick={() => {
                        onSetDeviceMode('auto');
                        setShowDeviceMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left ${
                        deviceInfo.overrideMode === 'auto'
                          ? 'bg-amber-500/20 text-amber-400 font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>Automático ({deviceInfo.isMobile ? 'Celular' : 'PC'})</span>
                    </button>
                    <button
                      onClick={() => {
                        onSetDeviceMode('mobile');
                        setShowDeviceMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left ${
                        deviceInfo.overrideMode === 'mobile'
                          ? 'bg-amber-500/20 text-amber-400 font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Modo Celular</span>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onSetDeviceMode('desktop');
                        setShowDeviceMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left ${
                        deviceInfo.overrideMode === 'desktop'
                          ? 'bg-amber-500/20 text-amber-400 font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Modo Computador</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Current User Badge */}
            <div className="hidden sm:flex items-center space-x-2.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800/80">
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold text-slate-100 truncate max-w-[150px]">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  MASP: {formatMasp(currentUser.masp)}
                </span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase font-mono tracking-wider ${getRoleBadgeColor(currentUser.role)}`}>
                {currentUser.role}
              </span>
            </div>

            {/* Password Change Button */}
            <button
              onClick={onChangePasswordClick}
              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 rounded-lg transition"
              title="Alterar Senha"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 text-xs bg-red-950/60 hover:bg-red-900/80 text-red-300 px-2.5 sm:px-3 py-1.5 rounded-lg border border-red-800/50 transition shadow-sm"
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

