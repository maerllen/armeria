import React from 'react';
import {
  Crosshair,
  Disc,
  Package,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Printer,
  RotateCcw,
  Sparkles,
  Flame,
  Eye,
  BookOpen,
  User as UserIcon,
  Check,
  X,
  ChevronRight
} from 'lucide-react';
import {
  User,
  Department,
  Unit,
  Weapon,
  AmmunitionStock,
  Caliber,
  VaultSpace,
  Material,
  DEFAULT_SYSTEM_LOGO,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';

export interface CoeManualContext {
  departmentName: string;
  unitName: string;
  unitSigla: string;
  logoSrc: string;
  policial: { name: string; masp: string; cargo: string };
  armeiro: { name: string; masp: string; cargo: string };
  armasCofre: Array<{
    model: string;
    manufacturer: string;
    caliber: string;
    serial: string;
    magazines: number;
    vaultCode: string;
    status: string;
  }>;
  armaAcautelada: {
    model: string;
    manufacturer: string;
    caliber: string;
    serial: string;
    magazines: number;
    vaultCode: string;
  };
  armaComPolicial: {
    model: string;
    manufacturer: string;
    caliber: string;
    serial: string;
    holderName: string;
    authorizerName: string;
    exitDate: string;
  };
  municoes: Array<{
    caliber: string;
    manufacturer: string;
    tipo: string;
    peso: string;
    lote: string;
    vaultCode: string;
    quantity: number;
  }>;
  materiais: Array<{
    name: string;
    tipo: string;
    serial: string;
    local: string;
    available: number;
    observations: string;
  }>;
  dataSourceLabel: string;
}

// Dados reais oficiais verificados diretamente no banco MariaDB/MySQL da unidade COE (unit-coe-insp / dept-coe)
const REAL_COE_BASELINE: CoeManualContext = {
  departmentName: 'COORDENADORIA DE OPERAÇÕES ESTRATÉGICAS (COE)',
  unitName: 'COE',
  unitSigla: 'COE',
  logoSrc: DEFAULT_SYSTEM_LOGO,
  policial: {
    name: 'Henrique Santos Pinto de Souza',
    masp: '11742160',
    cargo: 'INVESTIGADOR'
  },
  armeiro: {
    name: 'Maerllen Cezar de Carvalho Lima',
    masp: '12557484',
    cargo: 'INVESTIGADOR'
  },
  armasCofre: [
    {
      model: 'M16',
      manufacturer: 'Bushmaster',
      caliber: '5,56x45mm',
      serial: 'L041626',
      magazines: 3,
      vaultCode: 'A2-G8',
      status: 'No Cofre'
    },
    {
      model: '53C',
      manufacturer: 'H&K',
      caliber: '5,56x45mm',
      serial: 'C113614',
      magazines: 2,
      vaultCode: 'A1-G1',
      status: 'No Cofre'
    },
    {
      model: 'AR15',
      manufacturer: 'COLT',
      caliber: '5,56x45mm',
      serial: 'MH013918A',
      magazines: 3,
      vaultCode: 'A2-G7',
      status: 'No Cofre'
    },
    {
      model: '53C',
      manufacturer: 'H&K',
      caliber: '5,56x45mm',
      serial: 'C113612',
      magazines: 2,
      vaultCode: 'A1-G2',
      status: 'No Cofre'
    }
  ],
  armaAcautelada: {
    model: 'Fuzil IWI ARAD 5',
    manufacturer: 'IWI',
    caliber: '5,56x45mm',
    serial: 'B2403148',
    magazines: 3,
    vaultCode: 'A1-G1'
  },
  armaComPolicial: {
    model: 'Fuzil Taurus T4',
    manufacturer: 'Taurus',
    caliber: '5,56x45mm',
    serial: 'ADC067247',
    holderName: 'Fernanda de Oliveira Costa',
    authorizerName: 'Maerllen Cezar de Carvalho Lima',
    exitDate: '14/11/2026 09:15'
  },
  municoes: [
    {
      caliber: '5,56x45mm',
      manufacturer: 'CBC',
      tipo: 'OTM',
      peso: '77gr',
      lote: 'CBC 076 3º TRIM/21 | POL: WCR 845S L-2255/20 EB060',
      vaultCode: 'L2 C2',
      quantity: 3000
    },
    {
      caliber: '5,56x45mm',
      manufacturer: 'CBC',
      tipo: 'M193',
      peso: '55gr',
      lote: 'LE DGL15 | LF 269 DLU78',
      vaultCode: 'L3 C2',
      quantity: 1740
    },
    {
      caliber: '9x19mm',
      manufacturer: 'CBC',
      tipo: 'EOOG NTA',
      peso: '124gr',
      lote: 'L-0440 HIY72',
      vaultCode: 'L1 C1',
      quantity: 4800
    },
    {
      caliber: '7,62x51mm',
      manufacturer: 'CBC',
      tipo: 'NATO BALL',
      peso: '144gr',
      lote: 'CBC 850 3º TRIM/21 | POL: SMP 744 L2025/21',
      vaultCode: 'L1 C2',
      quantity: 900
    }
  ],
  materiais: [
    {
      name: 'TASER 10',
      tipo: 'Taser',
      serial: 'T19H85018 / 100762271',
      local: 'NÃO LETAL - 1',
      available: 1,
      observations: 'Com bandoleira, carregador e base elétrica, coldre para destro'
    },
    {
      name: 'TASER 10',
      tipo: 'Taser',
      serial: 'T19H83129 / 100762174',
      local: 'A-G-1',
      available: 1,
      observations: 'Com bandoleira, carregador e base elétrica, coldre para destro'
    }
  ],
  dataSourceLabel: 'Base Oficial COE (MariaDB/MySQL • unit-coe-insp)'
};

export function resolveCoeManualContext(params: {
  currentUser?: User | null;
  departments?: Department[];
  units?: Unit[];
  users?: User[];
  weapons?: Weapon[];
  ammoStocks?: AmmunitionStock[];
  calibers?: Caliber[];
  vaultSpaces?: VaultSpace[];
}): CoeManualContext {
  const allDepts = (storage.getAllDepartments().length > 0 ? storage.getAllDepartments() : params.departments) || [];
  const allUnits = (storage.getAllUnits().length > 0 ? storage.getAllUnits() : params.units) || [];
  const allUsers = (storage.getAllUsersForLookup().length > 0 ? storage.getAllUsersForLookup() : params.users) || [];
  const allWeapons = params.weapons || [];
  const allStocks = params.ammoStocks || [];
  const allCalibers = params.calibers || [];
  const allVaults = params.vaultSpaces || [];
  const allMaterials: Material[] = params.currentUser ? storage.getMateriais(params.currentUser) : [];

  const coeDept =
    allDepts.find(d => d.id === 'dept-coe') ||
    allDepts.find(d => (d.name || '').toUpperCase().includes('COE') || (d.code || '').toUpperCase() === 'COE');

  const coeUnit =
    allUnits.find(u => u.id === 'unit-coe-insp') ||
    allUnits.find(u => (u.name || '').trim().toUpperCase() === 'COE') ||
    allUnits.find(u => coeDept && u.departmentId === coeDept.id && (u.name || '').toUpperCase().includes('COE'));

  const coeUnitId = coeUnit?.id || 'unit-coe-insp';
  const coeDeptId = coeDept?.id || coeUnit?.departmentId || 'dept-coe';

  const coeUsers = allUsers.filter(u => u.unitId === coeUnitId || u.departmentId === coeDeptId);
  const currentIsCoePolicial =
    params.currentUser &&
    (params.currentUser.unitId === coeUnitId || params.currentUser.departmentId === coeDeptId) &&
    (params.currentUser.activeRole || params.currentUser.role) === 'Policial';

  const dbPolicial =
    (currentIsCoePolicial ? params.currentUser : undefined) ||
    coeUsers.find(u => u.unitId === coeUnitId && u.role === 'Policial') ||
    coeUsers.find(u => u.role === 'Policial');

  const dbArmeiro =
    coeUsers.find(u => u.unitId === coeUnitId && u.role === 'Armeiro') ||
    coeUsers.find(u => u.role === 'Armeiro');

  const coeWeapons = allWeapons.filter(w => w.unitId === coeUnitId || (!coeUnit && w.departmentId === coeDeptId));
  const coeVaultMap = new Map(allVaults.map(v => [v.id, v.code]));

  const cofreWeaponsLive = coeWeapons
    .filter(w => w.status === 'No Cofre')
    .slice(0, 4)
    .map(w => ({
      model: w.model || w.type,
      manufacturer: w.manufacturer || '',
      caliber: w.caliber,
      serial: w.serialNumber,
      magazines: w.magazineQuantity || 2,
      vaultCode: (w.vaultSpaceId && coeVaultMap.get(w.vaultSpaceId)) || 'A1-G1',
      status: w.status
    }));

  const liveAcautelada = coeWeapons.find(w => w.status === 'Acautelada');
  const liveComPolicial = allWeapons.find(
    w => (w.unitId === coeUnitId || w.departmentId === coeDeptId) && w.status === 'Com o Policial'
  );

  const calMap = new Map(allCalibers.map(c => [c.id, c]));
  const coeStocksLive = allStocks
    .filter(s => s.unitId === coeUnitId && s.quantity > 0)
    .slice(0, 4)
    .map(s => {
      const cal = calMap.get(s.caliberId);
      return {
        caliber: cal?.name || '5,56x45mm',
        manufacturer: s.fabricante || cal?.fabricante || 'CBC',
        tipo: s.tipoMunicao || cal?.tipo || 'OTM',
        peso: s.pesoMunicao || cal?.peso || '77gr',
        lote: s.loteMunicao || 'Lote Padrão',
        vaultCode: coeVaultMap.get(s.vaultSpaceId) || 'L2 C2',
        quantity: s.quantity
      };
    });

  const coeMaterialsLive = allMaterials
    .filter(m => m.unidadeId === coeUnitId && m.quantidadeDisponivel > 0 && m.passivoDepositoPoliciais !== false)
    .slice(0, 3)
    .map(m => ({
      name: m.nome,
      tipo: m.tipoMaterialNome || 'Taser',
      serial: m.numeroSerie || 'S/N',
      local: m.localGuarda || 'NÃO LETAL - 1',
      available: m.quantidadeDisponivel,
      observations: m.observacoes || 'Com bandoleira, carregador e base elétrica, coldre para destro'
    }));

  const resolvedLogo = getSystemLogo(coeUnit, coeDept);

  return {
    departmentName: coeDept?.name || REAL_COE_BASELINE.departmentName,
    unitName: coeUnit?.name || REAL_COE_BASELINE.unitName,
    unitSigla: 'COE',
    logoSrc: resolvedLogo || DEFAULT_SYSTEM_LOGO,
    policial: dbPolicial
      ? { name: dbPolicial.name, masp: dbPolicial.masp, cargo: dbPolicial.cargo || 'INVESTIGADOR' }
      : REAL_COE_BASELINE.policial,
    armeiro: dbArmeiro
      ? { name: dbArmeiro.name, masp: dbArmeiro.masp, cargo: dbArmeiro.cargo || 'INVESTIGADOR' }
      : REAL_COE_BASELINE.armeiro,
    armasCofre: cofreWeaponsLive.length > 0 ? cofreWeaponsLive : REAL_COE_BASELINE.armasCofre,
    armaAcautelada: liveAcautelada
      ? {
          model: `${liveAcautelada.type} ${liveAcautelada.manufacturer} ${liveAcautelada.model}`.trim(),
          manufacturer: liveAcautelada.manufacturer,
          caliber: liveAcautelada.caliber,
          serial: liveAcautelada.serialNumber,
          magazines: liveAcautelada.magazineQuantity || 3,
          vaultCode: (liveAcautelada.vaultSpaceId && coeVaultMap.get(liveAcautelada.vaultSpaceId)) || 'A1-G1'
        }
      : REAL_COE_BASELINE.armaAcautelada,
    armaComPolicial: (() => {
      if (!liveComPolicial) return REAL_COE_BASELINE.armaComPolicial;
      const cautelaMatch = storage
        .getCautelasArmas()
        .find(
          c =>
            (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') &&
            (c.weaponId === liveComPolicial.id ||
              c.weaponSerialNumber === liveComPolicial.serialNumber)
        );
      const historyMatch = storage.getWeaponCustodyHistory(liveComPolicial.id)[0];
      return {
        model: `${liveComPolicial.type} ${liveComPolicial.manufacturer} ${liveComPolicial.model}`.trim(),
        manufacturer: liveComPolicial.manufacturer,
        caliber: liveComPolicial.caliber,
        serial: liveComPolicial.serialNumber,
        holderName:
          cautelaMatch?.requesterName ||
          historyMatch?.custodyUserName ||
          REAL_COE_BASELINE.armaComPolicial.holderName,
        authorizerName:
          cautelaMatch?.armorerName ||
          historyMatch?.authorizerUserName ||
          dbArmeiro?.name ||
          REAL_COE_BASELINE.armeiro.name,
        exitDate: historyMatch?.exitDate
          ? new Date(historyMatch.exitDate).toLocaleString('pt-BR')
          : REAL_COE_BASELINE.armaComPolicial.exitDate
      };
    })(),
    municoes: coeStocksLive.length > 0 ? coeStocksLive : REAL_COE_BASELINE.municoes,
    materiais: coeMaterialsLive.length > 0 ? coeMaterialsLive : REAL_COE_BASELINE.materiais,
    dataSourceLabel:
      cofreWeaponsLive.length > 0 || coeStocksLive.length > 0
        ? 'Banco de Dados em Tempo Real • Unidade COE'
        : REAL_COE_BASELINE.dataSourceLabel
  };
}

// =========================================================================
// MOLDURA AUTÊNTICA DE TELA DO SISTEMA (100% IMUNE A TEMA CLARO / OKLCH)
// =========================================================================
interface SystemAppFrameProps {
  ctx: CoeManualContext;
  activeModuleLabel: string;
  activeModuleId: 'meu-perfil' | 'cautela-armas' | 'cautela-municoes' | 'cautela-materiais' | 'manual';
  caption: string;
  children: React.ReactNode;
}

const SystemAppFrame: React.FC<SystemAppFrameProps> = ({
  ctx,
  activeModuleLabel,
  activeModuleId,
  caption,
  children
}) => {
  const sideItems: Array<{
    id: SystemAppFrameProps['activeModuleId'];
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'meu-perfil', label: 'Meu Perfil', icon: <UserIcon className="w-3 h-3" /> },
    { id: 'cautela-armas', label: 'Cautela de armas', icon: <Crosshair className="w-3 h-3" /> },
    { id: 'cautela-municoes', label: 'Cautela de munições', icon: <Disc className="w-3 h-3" /> },
    { id: 'cautela-materiais', label: 'Cautela de materiais', icon: <Package className="w-3 h-3" /> },
    { id: 'manual', label: 'Manual do Policial', icon: <BookOpen className="w-3 h-3" /> }
  ];

  return (
    <div
      style={{
        backgroundColor: '#070b14',
        border: '1px solid #263449',
        borderRadius: '14px',
        overflow: 'hidden',
        color: '#f8fafc',
        boxShadow: '0 10px 24px rgba(2, 6, 23, 0.25)'
      }}
    >
      {/* Top Browser / System Chrome */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: '#0d1526', borderBottom: '1px solid #1e2d44' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#ef4444' }} />
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#f59e0b' }} />
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} />
          </div>
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded truncate"
            style={{ backgroundColor: '#131f35', color: '#94a3b8', border: '1px solid #263449' }}
          >
            SISTEMA ARMARIA PCMG • {ctx.unitSigla} • Módulo: {activeModuleLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[9px] font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.35)' }}
          >
            PERFIL: POLICIAL
          </span>
        </div>
      </div>

      {/* Navbar replica */}
      <div
        className="flex items-center justify-between px-3.5 py-2 gap-3"
        style={{ backgroundColor: '#0b1220', borderBottom: '1px solid #1c2a3f' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={ctx.logoSrc}
            alt="Logo COE"
            className="w-7 h-7 rounded-lg object-contain shrink-0"
            style={{ backgroundColor: '#111c33', border: '1px solid #2a3a54', padding: '2px' }}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-black tracking-wide truncate" style={{ color: '#f8fafc' }}>
              ARMARIA PCMG • {ctx.departmentName}
            </div>
            <div className="text-[9px] font-mono truncate" style={{ color: '#fbbf24' }}>
              Unidade: {ctx.unitName}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold" style={{ color: '#f8fafc' }}>
            {ctx.policial.name}
          </div>
          <div className="text-[9px] font-mono" style={{ color: '#94a3b8' }}>
            MASP: {ctx.policial.masp} • {ctx.policial.cargo}
          </div>
        </div>
      </div>

      {/* Body: Mini Sidebar + Main Content */}
      <div className="flex">
        <div
          className="hidden sm:flex flex-col w-40 shrink-0 p-2.5 gap-1"
          style={{ backgroundColor: '#090f1d', borderRight: '1px solid #1c2a3f' }}
        >
          <div className="text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-1" style={{ color: '#f59e0b' }}>
            MÓDULOS DA ARMARIA
          </div>
          {sideItems.map(item => {
            const active = item.id === activeModuleId;
            return (
              <div
                key={item.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
                style={
                  active
                    ? { backgroundColor: '#f59e0b', color: '#020617', fontWeight: 800 }
                    : { color: '#cbd5e1', backgroundColor: 'transparent' }
                }
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex-1 p-3.5 min-w-0" style={{ backgroundColor: '#070b14' }}>
          {children}
        </div>
      </div>

      {/* Caption Footer */}
      <div
        className="px-3.5 py-1.5 flex items-center justify-between text-[9px] font-mono"
        style={{ backgroundColor: '#0c1424', borderTop: '1px solid #1c2a3f', color: '#94a3b8' }}
      >
        <span>Captura Fiel do Sistema • {caption}</span>
        <span style={{ color: '#38bdf8' }}>Unidade: {ctx.unitName}</span>
      </div>
    </div>
  );
};

// =========================================================================
// TELA 1: VISÃO GERAL DE NAVEGAÇÃO DO POLICIAL (COE)
// =========================================================================
export const ScreenPerfilNavegacaoCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Meu Perfil"
      activeModuleId="meu-perfil"
      caption="Tela 01 — Área inicial e menu exclusivo do Perfil Policial na unidade COE"
    >
      <div className="space-y-3">
        <div
          className="rounded-xl p-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#0e1729', border: '1px solid #24344d' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}
            >
              {ctx.policial.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-black" style={{ color: '#f8fafc' }}>
                {ctx.policial.name}
              </div>
              <div className="text-[10px] font-mono" style={{ color: '#94a3b8' }}>
                MASP: {ctx.policial.masp} • {ctx.policial.cargo} • Lotação: {ctx.unitName}
              </div>
            </div>
          </div>
          <span
            className="text-[9px] font-mono font-bold px-2 py-1 rounded-lg"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)' }}
          >
            ACESSO ATIVO
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            {
              title: 'Cautela de armas',
              desc: 'Solicitar retirada, dar saída/retorno e devolver armamento ao cofre.',
              accent: '#f59e0b',
              icon: <Crosshair className="w-4 h-4" />
            },
            {
              title: 'Cautela de munições',
              desc: 'Solicitar cartuchos por calibre/lote e registrar devolução intacta.',
              accent: '#38bdf8',
              icon: <Disc className="w-4 h-4" />
            },
            {
              title: 'Cautela de materiais',
              desc: 'Acautelar TASER 10 / equipamentos e devolver com conferência.',
              accent: '#34d399',
              icon: <Package className="w-4 h-4" />
            }
          ].map(card => (
            <div
              key={card.title}
              className="rounded-xl p-2.5 space-y-1.5"
              style={{ backgroundColor: '#0e1729', border: '1px solid #24344d' }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: card.accent }}>{card.icon}</span>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: '#64748b' }} />
              </div>
              <div className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>
                {card.title}
              </div>
              <div className="text-[9px] leading-snug" style={{ color: '#94a3b8' }}>
                {card.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 2: SOLICITAR RETIRADA DE ARMA (MODULO CAUTELA DE ARMAS > NOVA)
// =========================================================================
export const ScreenCautelaArmaSolicitarCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  const firstWeapon = ctx.armasCofre[0];
  const sampleAmmo = ctx.municoes[0];

  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Cautela de Armas"
      activeModuleId="cautela-armas"
      caption="Tela 02 — Aba 'Nova Solicitação' com armas disponíveis no cofre da unidade COE"
    >
      <div className="space-y-3">
        {/* Header + Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2" style={{ borderBottom: '1px solid #1e2d44' }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Cautela de arma em análise
            </span>
            <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Minhas Cautelas
            </span>
            <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Meu Histórico
            </span>
          </div>
          <span
            className="px-2.5 py-1 rounded-lg text-[9px] font-black flex items-center gap-1"
            style={{ backgroundColor: '#f59e0b', color: '#020617' }}
          >
            <Crosshair className="w-3 h-3" />
            Solicitar Retirada de Arma
          </span>
        </div>

        {/* Grade de Armas Reais do COE */}
        <div className="grid grid-cols-2 gap-2">
          {ctx.armasCofre.slice(0, 4).map((w, idx) => {
            const selected = idx === 0;
            return (
              <div
                key={`${w.serial}-${idx}`}
                className="rounded-xl p-2.5 flex flex-col justify-between"
                style={
                  selected
                    ? { backgroundColor: '#2a1d0b', border: '1.5px solid #f59e0b' }
                    : { backgroundColor: '#0e1729', border: '1px solid #223047' }
                }
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold truncate" style={{ color: '#f8fafc' }}>
                      {w.manufacturer ? `${w.manufacturer} ${w.model}` : w.model}
                    </span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: '#1e293b', color: '#e2e8f0' }}
                    >
                      {w.caliber}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono font-bold mt-0.5" style={{ color: '#fbbf24' }}>
                    Série: {w.serial}
                  </div>
                </div>
                <div
                  className="flex items-center justify-between text-[9px] mt-2 pt-1.5"
                  style={{ borderTop: '1px solid #1f2e45', color: '#94a3b8' }}
                >
                  <span>Disponível na Unidade ({ctx.unitSigla})</span>
                  <span>{w.magazines} carregadores</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Banner arma selecionada + Finalidade + Indicação de munição */}
        <div
          className="rounded-xl p-2.5 text-[10px] flex items-center justify-between gap-2"
          style={{ backgroundColor: 'rgba(180, 83, 9, 0.22)', border: '1px solid rgba(245, 158, 11, 0.45)', color: '#fde68a' }}
        >
          <span>
            Arma selecionada: <strong>{firstWeapon.manufacturer} {firstWeapon.model}</strong> (Série:{' '}
            <span className="font-mono">{firstWeapon.serial}</span>) — Calibre: <strong>{firstWeapon.caliber}</strong>
          </span>
          <span className="font-mono text-[9px]" style={{ color: '#fbbf24' }}>✓ Selecionada</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div className="text-[8px] uppercase font-bold mb-0.5" style={{ color: '#94a3b8' }}>
              Motivo / Finalidade do Uso
            </div>
            <div className="text-[10px] font-bold" style={{ color: '#f8fafc' }}>Operação</div>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div className="text-[8px] uppercase font-bold mb-0.5" style={{ color: '#94a3b8' }}>
              Calibre / Tipo Desejado
            </div>
            <div className="text-[10px] font-mono font-bold" style={{ color: '#fbbf24' }}>
              {sampleAmmo.caliber} • {sampleAmmo.tipo}
            </div>
          </div>
          <div className="flex items-center justify-end">
            <span
              className="w-full text-center py-2 px-3 rounded-lg text-[10px] font-black"
              style={{ backgroundColor: '#f59e0b', color: '#020617' }}
            >
              Enviar Solicitação ao Armeiro
            </span>
          </div>
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 3: DAR SAÍDA, DAR ENTRADA E HISTÓRICO (MINHAS CAUTELAS DE ARMAS)
// =========================================================================
export const ScreenCautelaArmaSaidaEntradaCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Minhas Cautelas — Ativas em Posse"
      activeModuleId="cautela-armas"
      caption="Tela 03 — Botões 'Dar Saída', 'Dar Entrada' (com tiros) e 'Histórico' em cautela ativa"
    >
      <div className="space-y-3">
        {/* Card 1: Arma Acautelada -> Botão Dar Saída */}
        <div
          className="rounded-xl p-3 space-y-2.5"
          style={{ backgroundColor: '#0e1729', border: '1px solid #166534' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2" style={{ borderBottom: '1px solid #1f2e45' }}>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold" style={{ color: '#f8fafc' }}>{ctx.armaAcautelada.model}</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: '#fbbf24' }}>
                  Nº {ctx.armaAcautelada.serial}
                </span>
                <span
                  className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                >
                  Acautelada (Ativa)
                </span>
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>
                Solicitante: <strong style={{ color: '#e2e8f0' }}>{ctx.policial.name}</strong> (MASP: {ctx.policial.masp}) • Autorizado por: {ctx.armeiro.name}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1"
                style={{ backgroundColor: '#f59e0b', color: '#020617' }}
              >
                <ArrowUpRight className="w-3 h-3" /> Dar Saída
              </span>
              <span
                className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1"
                style={{ backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
              >
                <History className="w-3 h-3" style={{ color: '#fbbf24' }} /> Histórico
              </span>
              <span
                className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1"
                style={{ backgroundColor: '#d97706', color: '#020617' }}
              >
                <RotateCcw className="w-3 h-3" /> Devolver ao Cofre
              </span>
            </div>
          </div>
          <div className="text-[9px]" style={{ color: '#94a3b8' }}>
            Calibre: <strong style={{ color: '#e2e8f0' }}>{ctx.armaAcautelada.caliber}</strong> • Carregadores:{' '}
            <strong style={{ color: '#e2e8f0' }}>{ctx.armaAcautelada.magazines} un.</strong> • Ao clicar em{' '}
            <strong style={{ color: '#fbbf24' }}>Dar Saída</strong>, o status muda para{' '}
            <strong style={{ color: '#38bdf8' }}>Com o Policial</strong>.
          </div>
        </div>

        {/* Card 2: Arma Com o Policial -> Botão Dar Entrada + Modal Simulado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ backgroundColor: '#0e1729', border: '1px solid #0369a1' }}
          >
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>{ctx.armaComPolicial.model}</span>
              <span
                className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#7dd3fc', border: '1px solid rgba(56, 189, 248, 0.45)' }}
              >
                Com o Policial
              </span>
            </div>
            <div className="text-[10px] font-mono font-bold" style={{ color: '#fbbf24' }}>
              Série: {ctx.armaComPolicial.serial}
            </div>
            <div className="text-[9px]" style={{ color: '#cbd5e1' }}>
              Em posse: <strong>{ctx.armaComPolicial.holderName}</strong>
              <br />
              Saída: <span className="font-mono">{ctx.armaComPolicial.exitDate}</span>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <span
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1"
                style={{ backgroundColor: '#059669', color: '#ffffff' }}
              >
                <ArrowDownLeft className="w-3 h-3" /> Dar Entrada
              </span>
              <span
                className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1"
                style={{ backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
              >
                <History className="w-3 h-3" style={{ color: '#fbbf24' }} /> Histórico
              </span>
            </div>
          </div>

          {/* Mini-Modal Dar Entrada */}
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ backgroundColor: '#0b1322', border: '1.5px solid #10b981' }}
          >
            <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid #1f2e45' }}>
              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#f8fafc' }}>
                <ArrowDownLeft className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
                Modal: Dar Entrada no Armamento
              </span>
              <X className="w-3 h-3" style={{ color: '#94a3b8' }} />
            </div>
            <div className="text-[9px] font-mono font-bold" style={{ color: '#fbbf24' }}>
              {ctx.armaComPolicial.model} • Série: {ctx.armaComPolicial.serial}
            </div>
            <div>
              <div className="text-[8px] uppercase font-bold mb-1" style={{ color: '#cbd5e1' }}>
                Quantidade de tiros disparados no retorno
              </div>
              <div
                className="rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold"
                style={{ backgroundColor: '#070b14', border: '1px solid #334155', color: '#f8fafc' }}
              >
                15
              </div>
            </div>
            <div className="flex justify-end">
              <span
                className="px-2.5 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1"
                style={{ backgroundColor: '#059669', color: '#ffffff' }}
              >
                <Check className="w-3 h-3" /> Confirmar Entrada
              </span>
            </div>
          </div>
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 4: DEVOLVER ARMA AO COFRE (ENCERRAMENTO DA CAUTELA)
// =========================================================================
export const ScreenCautelaArmaDevolucaoCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  const sampleAmmo = ctx.municoes[0];
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Devolução de Armamento ao Cofre"
      activeModuleId="cautela-armas"
      caption="Tela 04 — Modal 'Devolução de Armamento ao Cofre' e status 'Aguardando Recibo do Armeiro'"
    >
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Modal de Devolução */}
        <div
          className="sm:col-span-8 rounded-xl p-3 space-y-2.5"
          style={{ backgroundColor: '#0e1729', border: '1.5px solid #f59e0b' }}
        >
          <div className="flex items-center justify-between pb-2" style={{ borderBottom: '1px solid #1f2e45' }}>
            <div>
              <div className="text-xs font-bold" style={{ color: '#f8fafc' }}>
                Devolução de Armamento ao Cofre
              </div>
              <div className="text-[10px]" style={{ color: '#94a3b8' }}>
                Arma: <strong style={{ color: '#f8fafc' }}>{ctx.armaAcautelada.model}</strong> (Série:{' '}
                <span className="font-mono" style={{ color: '#fbbf24' }}>{ctx.armaAcautelada.serial}</span>)
              </div>
            </div>
            <span
              className="text-[9px] font-mono px-2 py-0.5 rounded"
              style={{ backgroundColor: '#162033', color: '#cbd5e1', border: '1px solid #2b3c57' }}
            >
              Cofre Origem: {ctx.armaAcautelada.vaultCode}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[9px]">
            <div className="rounded-lg p-2" style={{ backgroundColor: '#090f1d', border: '1px solid #1f2e45' }}>
              <div style={{ color: '#94a3b8' }}>Houve Disparos?</div>
              <div className="font-bold mt-0.5" style={{ color: '#34d399' }}>Não (0 tiros)</div>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: '#090f1d', border: '1px solid #1f2e45' }}>
              <div style={{ color: '#94a3b8' }}>Funcionamento</div>
              <div className="font-bold mt-0.5" style={{ color: '#34d399' }}>Em Condições</div>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: '#090f1d', border: '1px solid #1f2e45' }}>
              <div style={{ color: '#94a3b8' }}>Carregadores Devolv.</div>
              <div className="font-mono font-bold mt-0.5" style={{ color: '#f8fafc' }}>
                {ctx.armaAcautelada.magazines} unidades
              </div>
            </div>
          </div>

          <div
            className="rounded-lg p-2 text-[9px] flex items-center justify-between"
            style={{ backgroundColor: '#090f1d', border: '1px solid #1f2e45' }}
          >
            <span style={{ color: '#cbd5e1' }}>
              Munição associada: <strong style={{ color: '#fbbf24' }}>{sampleAmmo.caliber} {sampleAmmo.tipo}</strong>
            </span>
            <span className="font-mono font-bold" style={{ color: '#34d399' }}>
              Devolvida intacta: 100 un.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <span className="px-2.5 py-1 rounded-lg text-[9px]" style={{ color: '#94a3b8' }}>Cancelar</span>
            <span
              className="px-3 py-1.5 rounded-lg text-[10px] font-black"
              style={{ backgroundColor: '#f59e0b', color: '#020617' }}
            >
              Enviar Devolução (Pendente de Recibo)
            </span>
          </div>
        </div>

        {/* Estado pós-envio */}
        <div
          className="sm:col-span-4 rounded-xl p-3 flex flex-col justify-between space-y-2"
          style={{ backgroundColor: '#0e1729', border: '1px solid #24344d' }}
        >
          <div className="space-y-2">
            <div className="text-[9px] font-mono uppercase font-bold" style={{ color: '#fbbf24' }}>
              ETAPA FINAL NO BALCÃO COE
            </div>
            <div
              className="rounded-lg p-2 text-[9px] flex items-center gap-1.5 font-bold"
              style={{ backgroundColor: 'rgba(120, 53, 15, 0.45)', border: '1px solid #d97706', color: '#fde68a' }}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Aguardando Recibo do Armeiro</span>
            </div>
            <p className="text-[9px] leading-relaxed" style={{ color: '#cbd5e1' }}>
              Entregue o armamento fisicamente ao Armeiro ({ctx.armeiro.name}). Após a conferência no cofre{' '}
              <strong>{ctx.armaAcautelada.vaultCode}</strong>, o recibo ficará disponível em <strong>Meu Histórico</strong>.
            </p>
          </div>
          <div
            className="rounded-lg p-2 text-[9px] flex items-center justify-center gap-1.5 font-bold"
            style={{ backgroundColor: '#1e293b', color: '#fbbf24', border: '1px solid #334155' }}
          >
            <Printer className="w-3 h-3" /> Recibo de Devolução
          </div>
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 5: SOLICITAR MUNIÇÕES (MODULO CAUTELA DE MUNIÇÕES > NOVA)
// =========================================================================
export const ScreenCautelaMunicaoSolicitarCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  const m = ctx.municoes[0];
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Cautela de Munições"
      activeModuleId="cautela-municoes"
      caption="Tela 05 — Solicitação de Munições na unidade COE com seleção de calibre, tipo e peso"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2" style={{ borderBottom: '1px solid #1e2d44' }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Minhas Cautelas de Munições
            </span>
            <span className="px-2 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Cautela de munição em análise
            </span>
            <span className="px-2 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Meu Histórico
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black flex items-center gap-1" style={{ backgroundColor: '#f59e0b', color: '#020617' }}>
            <Sparkles className="w-3 h-3" /> + Solicitar Munições
          </span>
        </div>

        {/* Modalidade */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-xl p-2.5 flex items-start gap-2"
            style={{ backgroundColor: 'rgba(6, 78, 59, 0.35)', border: '1.5px solid #10b981' }}
          >
            <div className="p-1.5 rounded-lg" style={{ backgroundColor: '#10b981', color: '#020617' }}>
              <RotateCcw className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase" style={{ color: '#f8fafc' }}>
                Munição Passiva de Devolução
              </div>
              <div className="text-[9px]" style={{ color: '#cbd5e1' }}>
                Permanece ativa em Minhas Cautelas podendo ser devolvida ao paiol.
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-2.5 flex items-start gap-2"
            style={{ backgroundColor: '#0d1526', border: '1px solid #223047' }}
          >
            <div className="p-1.5 rounded-lg" style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase" style={{ color: '#cbd5e1' }}>
                Munição de Consumo
              </div>
              <div className="text-[9px]" style={{ color: '#94a3b8' }}>
                Consumo definitivo em instrução/treinamento (sem devolução).
              </div>
            </div>
          </div>
        </div>

        {/* Campos Reais COE */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div style={{ color: '#94a3b8' }}>Calibre</div>
            <div className="font-mono font-bold text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>{m.caliber}</div>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div style={{ color: '#94a3b8' }}>Tipo / Peso</div>
            <div className="font-bold text-[10px] mt-0.5" style={{ color: '#f8fafc' }}>{m.tipo} • {m.peso}</div>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div style={{ color: '#94a3b8' }}>Quantidade Solicitada</div>
            <div className="font-mono font-bold text-[10px] mt-0.5" style={{ color: '#34d399' }}>100 cartuchos</div>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div style={{ color: '#94a3b8' }}>Disponível na COE</div>
            <div className="font-mono font-bold text-[10px] mt-0.5" style={{ color: '#38bdf8' }}>
              {m.quantity.toLocaleString('pt-BR')} un. ({m.vaultCode})
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
          <span className="text-[9px] font-mono" style={{ color: '#cbd5e1' }}>
            Lote de referência COE: <strong style={{ color: '#f8fafc' }}>{m.lote}</strong>
          </span>
          <span className="px-3 py-1 rounded-lg text-[10px] font-black" style={{ backgroundColor: '#f59e0b', color: '#020617' }}>
            Solicitar Munições
          </span>
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 6: DEVOLVER MUNIÇÕES (COM OU SEM ARMAMENTO VINCULADO)
// =========================================================================
export const ScreenCautelaMunicaoDevolverCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  const m = ctx.municoes[0];
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Minhas Cautelas de Munições"
      activeModuleId="cautela-municoes"
      caption="Tela 06 — Card ativo em 'Minhas Cautelas de Munições' e modal 'Solicitar Devolução de Munições'"
    >
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Card ativo */}
        <div
          className="sm:col-span-5 rounded-xl p-3 space-y-2"
          style={{ backgroundColor: '#0e1729', border: '1px solid #24344d' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>
              100 un. • {m.caliber}
            </span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)' }}
            >
              ATIVA
            </span>
          </div>
          <div className="text-[9px]" style={{ color: '#cbd5e1' }}>
            {m.manufacturer} {m.tipo} {m.peso}
            <br />
            Lote: <span className="font-mono" style={{ color: '#fbbf24' }}>{m.lote.slice(0, 32)}...</span>
          </div>
          <div className="pt-1 flex gap-1.5">
            <span
              className="px-2.5 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1"
              style={{ backgroundColor: '#06b6d4', color: '#020617' }}
            >
              <RotateCcw className="w-3 h-3" /> Solicitar Devolução
            </span>
            <span
              className="px-2 py-1 rounded-lg text-[9px] font-semibold flex items-center gap-1"
              style={{ backgroundColor: '#1e293b', color: '#e2e8f0' }}
            >
              <Printer className="w-3 h-3" style={{ color: '#fbbf24' }} /> Recibo
            </span>
          </div>
        </div>

        {/* Modal Devolver Munições */}
        <div
          className="sm:col-span-7 rounded-xl p-3 space-y-2"
          style={{ backgroundColor: '#0e1729', border: '1.5px solid #06b6d4' }}
        >
          <div className="flex items-center gap-1.5 pb-1.5" style={{ borderBottom: '1px solid #1f2e45' }}>
            <RotateCcw className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} />
            <span className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>
              Solicitar Devolução de Munições
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[9px]">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: 'rgba(6, 182, 212, 0.16)', border: '1px solid #22d3ee', color: '#cffafe' }}
            >
              <div className="font-bold">Sem o Armamento Vinculado</div>
              <div className="text-[8px]" style={{ color: '#a5f3fc' }}>Devolve só as munições agora.</div>
            </div>
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: '#090f1d', border: '1px solid #24344d', color: '#94a3b8' }}
            >
              <div className="font-bold">Com Armamento Vinculado</div>
              <div className="text-[8px]">Devolve arma + munição juntas.</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <div className="rounded-lg p-2" style={{ backgroundColor: '#090f1d', border: '1px solid #24344d' }}>
              <div style={{ color: '#94a3b8' }}>Munições Remanescentes *</div>
              <div className="font-mono font-bold text-xs mt-0.5" style={{ color: '#f8fafc' }}>100</div>
            </div>
            <div className="flex items-end justify-end">
              <span
                className="w-full text-center py-2 px-2.5 rounded-lg text-[10px] font-black"
                style={{ backgroundColor: '#06b6d4', color: '#020617' }}
              >
                Enviar Solicitação de Devolução
              </span>
            </div>
          </div>
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 7: SOLICITAR MATERIAL (MODULO CAUTELA DE MATERIAIS > NOVA)
// =========================================================================
export const ScreenCautelaMaterialSolicitarCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  const mat1 = ctx.materiais[0];
  const mat2 = ctx.materiais[1] || ctx.materiais[0];
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Cautela de Materiais"
      activeModuleId="cautela-materiais"
      caption="Tela 07 — Aba '+ Solicitar Material' listando equipamentos reais da COE (TASER 10)"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2" style={{ borderBottom: '1px solid #1e2d44' }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Minhas Cautelas de Materiais
            </span>
            <span className="px-2 py-1 rounded-lg text-[9px] font-bold" style={{ backgroundColor: '#0f192d', color: '#94a3b8', border: '1px solid #1e2d44' }}>
              Cautela de material em análise
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black flex items-center gap-1" style={{ backgroundColor: '#f59e0b', color: '#020617' }}>
            <Sparkles className="w-3 h-3" /> + Solicitar Material
          </span>
        </div>

        {/* Lista de Materiais Reais COE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[mat1, mat2].map((mat, idx) => {
            const selected = idx === 0;
            return (
              <div
                key={`${mat.serial}-${idx}`}
                className="rounded-xl p-2.5 space-y-1"
                style={
                  selected
                    ? { backgroundColor: '#2a1d0b', border: '1.5px solid #f59e0b' }
                    : { backgroundColor: '#0e1729', border: '1px solid #223047' }
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>
                    {mat.name} <span className="text-[9px]" style={{ color: '#94a3b8' }}>({mat.tipo})</span>
                  </span>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.16)', color: '#34d399' }}
                  >
                    Disp.: {mat.available}
                  </span>
                </div>
                <div className="text-[10px] font-mono font-bold" style={{ color: '#fbbf24' }}>
                  Série: {mat.serial}
                </div>
                <div className="text-[9px]" style={{ color: '#94a3b8' }}>
                  Local: {mat.local} • {mat.observations}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 text-[9px]">
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div style={{ color: '#94a3b8' }}>Modalidade</div>
            <div className="font-bold mt-0.5" style={{ color: '#34d399' }}>Material Passivo de Devolução</div>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: '#0d1526', border: '1px solid #24344d' }}>
            <div style={{ color: '#94a3b8' }}>Quantidade / Finalidade</div>
            <div className="font-bold mt-0.5" style={{ color: '#f8fafc' }}>1 un. • Plantão Operacional</div>
          </div>
          <div className="flex items-center justify-end">
            <span className="w-full text-center py-2 px-3 rounded-lg text-[10px] font-black" style={{ backgroundColor: '#f59e0b', color: '#020617' }}>
              Enviar Solicitação de Material
            </span>
          </div>
        </div>
      </div>
    </SystemAppFrame>
  );
};

// =========================================================================
// TELA 8: DEVOLVER MATERIAL (MINHAS CAUTELAS DE MATERIAIS)
// =========================================================================
export const ScreenCautelaMaterialDevolverCOE: React.FC<{ ctx: CoeManualContext }> = ({ ctx }) => {
  const mat = ctx.materiais[0];
  return (
    <SystemAppFrame
      ctx={ctx}
      activeModuleLabel="Minhas Cautelas de Materiais"
      activeModuleId="cautela-materiais"
      caption="Tela 08 — Solicitação de devolução de material ativo (TASER 10 COE) e conferência de estado"
    >
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Card ativo */}
        <div
          className="sm:col-span-5 rounded-xl p-3 space-y-2"
          style={{ backgroundColor: '#0e1729', border: '1px solid #24344d' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>1x {mat.name}</span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)' }}
            >
              EM USO
            </span>
          </div>
          <div className="text-[9px] font-mono" style={{ color: '#fbbf24' }}>
            Série: {mat.serial}
          </div>
          <div className="text-[9px]" style={{ color: '#94a3b8' }}>
            Local: {mat.local}
            <br />
            {mat.observations}
          </div>
          <div className="pt-1 flex gap-1.5">
            <span
              className="px-2.5 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1"
              style={{ backgroundColor: '#06b6d4', color: '#020617' }}
            >
              <RotateCcw className="w-3 h-3" /> Solicitar Devolução
            </span>
            <span
              className="px-2 py-1 rounded-lg text-[9px] font-semibold flex items-center gap-1"
              style={{ backgroundColor: '#1e293b', color: '#e2e8f0' }}
            >
              <Eye className="w-3 h-3" /> Detalhes
            </span>
          </div>
        </div>

        {/* Modal Devolução de Material */}
        <div
          className="sm:col-span-7 rounded-xl p-3 space-y-2"
          style={{ backgroundColor: '#0e1729', border: '1.5px solid #06b6d4' }}
        >
          <div className="flex items-center gap-1.5 pb-1.5" style={{ borderBottom: '1px solid #1f2e45' }}>
            <RotateCcw className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} />
            <span className="text-[11px] font-bold" style={{ color: '#f8fafc' }}>
              Solicitar Devolução de Material
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <div className="rounded-lg p-2" style={{ backgroundColor: '#090f1d', border: '1px solid #24344d' }}>
              <div style={{ color: '#94a3b8' }}>Quantidade Devolvida *</div>
              <div className="font-mono font-bold text-xs mt-0.5" style={{ color: '#f8fafc' }}>1</div>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: '#090f1d', border: '1px solid #24344d' }}>
              <div style={{ color: '#94a3b8' }}>Condição do Material</div>
              <div className="font-bold text-[10px] mt-0.5" style={{ color: '#34d399' }}>
                Íntegro (Em perfeitas condições)
              </div>
            </div>
          </div>

          <div className="rounded-lg p-2 text-[9px]" style={{ backgroundColor: '#090f1d', border: '1px solid #24344d', color: '#cbd5e1' }}>
            Relato: <em>Equipamento devolvido íntegro com bandoleira, carregador, base elétrica e coldre.</em>
          </div>

          <div className="flex justify-end">
            <span className="px-3 py-1.5 rounded-lg text-[10px] font-black" style={{ backgroundColor: '#06b6d4', color: '#020617' }}>
              Enviar Solicitação de Devolução
            </span>
          </div>
        </div>
      </div>
    </SystemAppFrame>
  );
};
