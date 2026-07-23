import React, { useState } from 'react';
import { User } from '../types';
import { formatMasp } from '../utils/masks';
import { storage } from '../services/storage';
import { Shield, UserCheck, LogOut, KeyRound, RefreshCw } from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  onChangePasswordClick: () => void;
  onUserSwitched: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  onChangePasswordClick,
  onUserSwitched
}) => {
  const [showTesterMenu, setShowTesterMenu] = useState(false);
  const allUsers = storage.getAllUsersUnfiltered();

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

  const handleSwitchUser = (user: User) => {
    storage.setCurrentUser(user);
    storage.addAuditLog('Login', 'Login', `[Tester] Alternado para o perfil ${user.name} (${user.role})`);
    setShowTesterMenu(false);
    onUserSwitched();
  };

  const handleResetData = () => {
    if (window.confirm('Deseja restaurar os dados do sistema para o estado inicial de demonstração?')) {
      storage.resetToSeedData();
      onUserSwitched();
    }
  };

  return (
    <header className="glass border-b border-slate-800/80 text-slate-100 sticky top-0 z-30 shadow-2xl backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Brand Logo */}
        <div className="flex items-center space-x-3">
          <div className="bg-amber-500 p-2 rounded-xl text-slate-950 font-bold shadow-lg shadow-amber-500/20 neon-border flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-xl tracking-wider text-slate-100 font-mono">ARMERIA</span>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 font-semibold px-2 py-0.5 rounded border border-amber-500/30 uppercase tracking-widest font-mono">
                POLÍCIA CIVIL
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block font-sans">
              Gestão e Cautela Tática de Armamentos e Munições
            </p>
          </div>
        </div>

        {/* Right: Quick Tester, User info & Logout */}
        {currentUser && (
          <div className="flex items-center space-x-3">
            
            {/* Quick Profile Tester Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowTesterMenu(!showTesterMenu)}
                className="flex items-center space-x-1.5 text-xs bg-slate-900/80 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700/80 transition shadow-sm"
                title="Alternar perfis de teste rápido"
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline font-medium">Alternar Perfil</span>
              </button>

              {showTesterMenu && (
                <div className="absolute right-0 mt-2 w-72 glass-card border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-xs text-slate-200">
                  <div className="px-3 py-1.5 border-b border-slate-700/80 font-semibold text-slate-400 flex justify-between items-center font-mono text-[10px]">
                    <span>SELECIONAR PERFIL DE TESTE:</span>
                    <button 
                      onClick={handleResetData} 
                      className="text-amber-400 hover:underline flex items-center space-x-1"
                      title="Restaurar Banco de Dados"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {allUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSwitchUser(u)}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-800/80 flex flex-col space-y-0.5 border-b border-slate-800/50 transition ${
                          u.id === currentUser.id ? 'bg-slate-800/90 text-amber-400 font-medium' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-100">{u.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-mono font-bold ${getRoleBadgeColor(u.role)}`}>
                            {u.role}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          MASP: {formatMasp(u.masp)} • {u.cargo}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
              className="flex items-center space-x-1.5 text-xs bg-red-950/60 hover:bg-red-900/80 text-red-300 px-3 py-1.5 rounded-lg border border-red-800/50 transition shadow-sm"
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
