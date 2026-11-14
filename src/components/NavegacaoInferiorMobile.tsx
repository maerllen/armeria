import React from 'react';
import { ModuleType, User as UserType, getAllowedModulesForUser } from '../types';
import { User, Crosshair, ArrowRightLeft, Smartphone, Menu, Bomb, Disc, Package, BookOpen } from 'lucide-react';

interface MobileBottomNavProps {
  currentUser?: UserType | null;
  activeModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  onOpenMobileMenu: () => void;
  pendingMovementsCount?: number;
  pendingWeaponCautelasCount?: number;
  pendingAmmoCautelasCount?: number;
  pendingMaterialCautelasCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  activeModule,
  onSelectModule,
  onOpenMobileMenu,
  pendingMovementsCount = 0,
  pendingWeaponCautelasCount = 0,
  pendingAmmoCautelasCount = 0,
  pendingMaterialCautelasCount = 0
}) => {
  const allowedModules = getAllowedModulesForUser(currentUser);

  const allQuickTabs: { id: ModuleType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    {
      id: 'meu-perfil',
      label: 'Perfil',
      icon: User
    },
    {
      id: 'cautela-armas',
      label: 'Cautela Armas',
      icon: Crosshair,
      badge: pendingWeaponCautelasCount > 0 ? pendingWeaponCautelasCount : undefined
    },
    {
      id: 'cautela-municoes',
      label: 'Cautela Mun.',
      icon: Disc,
      badge: pendingAmmoCautelasCount > 0 ? pendingAmmoCautelasCount : undefined
    },
    {
      id: 'cautela-materiais',
      label: 'Cautela Mat.',
      icon: Package,
      badge: pendingMaterialCautelasCount > 0 ? pendingMaterialCautelasCount : undefined
    },
    {
      id: 'explosivos',
      label: 'Explosivos',
      icon: Bomb
    },
    {
      id: 'armas',
      label: 'Armas',
      icon: Crosshair
    },
    {
      id: 'municoes',
      label: 'Munições',
      icon: Disc
    },
    {
      id: 'movimentacoes',
      label: 'Movimentações',
      icon: ArrowRightLeft,
      badge: pendingMovementsCount > 0 ? pendingMovementsCount : undefined
    },
    {
      id: 'iniciar-aula-mobile',
      label: 'Aula',
      icon: Smartphone
    },
    {
      id: 'manual',
      label: 'Manual',
      icon: BookOpen
    }
  ];

  const visibleTabs = allQuickTabs.filter(tab => allowedModules.includes(tab.id));

  return (
    <nav
      aria-label="Navegação Mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] flex items-center shadow-2xl print:hidden"
    >
      <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 pr-1">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeModule === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectModule(tab.id)}
              className={`shrink-0 min-w-[66px] min-h-[48px] flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
                isActive
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-amber-400'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-slate-950' : ''}`} />
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 text-[9px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border ${
                      isActive
                        ? 'bg-slate-950 text-amber-400 border-amber-500'
                        : 'bg-amber-500 text-slate-950 border-slate-950'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Pinned Menu Button to trigger full sidebar drawer */}
      <button
        onClick={onOpenMobileMenu}
        className="shrink-0 min-w-[58px] min-h-[48px] flex flex-col items-center justify-center py-1 px-2 ml-1.5 pl-2.5 border-l border-slate-800/80 rounded-r-xl text-slate-300 hover:text-amber-400 transition-all"
        aria-label="Abrir Menu Completo"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] mt-0.5 tracking-tight leading-none font-semibold">Menu</span>
      </button>
    </nav>
  );
};
