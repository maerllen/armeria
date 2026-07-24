import React from 'react';
import { User as UserType, ModuleType } from '../types';
import {
  User,
  Building2,
  Users,
  Vault,
  Disc,
  Crosshair,
  ArrowRightLeft,
  FileText,
  BookOpen
} from 'lucide-react';

interface SidebarProps {
  currentUser: UserType | null;
  activeModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  pendingMovementsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeModule,
  onSelectModule,
  pendingMovementsCount = 0
}) => {
  const userRole = currentUser?.role || 'Policial';

  const navItems: { id: ModuleType; label: string; icon: React.ComponentType<{ className?: string }>; visible: boolean; badge?: number }[] = [
    {
      id: 'meu-perfil',
      label: 'Meu Perfil',
      icon: User,
      visible: true
    },
    {
      id: 'unidade',
      label: 'Unidades e Deptos',
      icon: Building2,
      visible: true
    },
    {
      id: 'usuarios',
      label: 'Usuários e Cursos',
      icon: Users,
      visible: true
    },
    {
      id: 'cofre',
      label: 'Locais do Cofre',
      icon: Vault,
      visible: true
    },
    {
      id: 'municoes',
      label: 'Munições',
      icon: Disc,
      visible: true
    },
    {
      id: 'armas',
      label: 'Armas',
      icon: Crosshair,
      visible: true
    },
    {
      id: 'movimentacoes',
      label: 'Movimentações',
      icon: ArrowRightLeft,
      visible: true,
      badge: pendingMovementsCount > 0 ? pendingMovementsCount : undefined
    },
    {
      id: 'relatorio',
      label: 'Relatórios',
      icon: FileText,
      visible: userRole === 'Geral' || userRole === 'Administrador' || userRole === 'Armeiro'
    },
    {
      id: 'manual',
      label: 'Manual do Sistema',
      icon: BookOpen,
      visible: true
    }
  ];

  return (
    <aside className="w-full md:w-64 glass border-r border-slate-800/80 shrink-0 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between print:hidden">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[10px] font-bold text-amber-400/80 uppercase tracking-widest font-mono">
          MÓDULOS DA ARMERIA
        </div>
        <nav className="space-y-1.5">
          {navItems
            .filter(item => item.visible)
            .map(item => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectModule(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20 neon-border'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-amber-400'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-slate-950 text-amber-400'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="mt-8 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
        <p className="font-semibold text-slate-400 font-mono">Armeria v2.0 • Polícia Civil</p>
        <p className="text-[10px] text-slate-500">Gestão Tática de Armamento</p>
      </div>
    </aside>
  );
};
