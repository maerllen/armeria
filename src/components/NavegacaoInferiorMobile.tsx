import React from 'react';
import { ModuleType, User as UserType } from '../types';
import { User, Crosshair, Disc, ArrowRightLeft, Smartphone, Menu } from 'lucide-react';

interface MobileBottomNavProps {
  currentUser?: UserType | null;
  activeModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  onOpenMobileMenu: () => void;
  pendingMovementsCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  activeModule,
  onSelectModule,
  onOpenMobileMenu,
  pendingMovementsCount = 0
}) => {
  const isGeral = currentUser?.role === 'Geral';

  const quickTabs: { id: ModuleType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; visible?: boolean }[] = [
    {
      id: 'meu-perfil',
      label: 'Perfil',
      icon: User,
      visible: true
    },
    {
      id: 'armas',
      label: 'Armas',
      icon: Crosshair,
      visible: true
    },
    {
      id: 'municoes',
      label: 'Munições',
      icon: Disc,
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
      id: 'iniciar-aula-mobile',
      label: 'Aula',
      icon: Smartphone,
      visible: isGeral
    }
  ];

  const visibleTabs = quickTabs.filter(tab => tab.visible !== false);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around shadow-2xl print:hidden">
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeModule === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectModule(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
              isActive
                ? 'text-amber-400 font-bold bg-amber-500/10 scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {tab.badge !== undefined && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-slate-950">
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
          </button>
        );
      })}

      {/* Menu Button to trigger sidebar drawer */}
      <button
        onClick={onOpenMobileMenu}
        className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-400 hover:text-amber-400 transition-all"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] mt-0.5 tracking-tight">Menu</span>
      </button>
    </div>
  );
};
