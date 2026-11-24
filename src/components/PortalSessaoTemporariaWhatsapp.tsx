import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
  Department,
  Unit,
  VaultSpace,
  Caliber,
  AmmunitionStock,
  Weapon,
  DEFAULT_SYSTEM_LOGO
} from '../types';
import { storage } from '../services/storage';
import { ModuloCautelaArmas } from './ModuloCautelaArmas';
import { ModuloCautelaMunicoes } from './ModuloCautelaMunicoes';
import { ModuloCautelaMateriais } from './ModuloCautelaMateriais';
import {
  MessageCircle,
  Crosshair,
  Disc,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  LogOut
} from 'lucide-react';

interface PortalSessaoTemporariaWhatsappProps {
  token: string;
  onExitToApp: () => void;
}

type CautelaCategoryTab = 'armas' | 'municoes' | 'materiais';

interface TempSessionData {
  sessionId: string;
  tipoFluxo: 'SOLICITAR_CAUTELA' | 'DEVOLVER_CAUTELA';
  expiresAt: string;
  fromPhone: string;
  whatsappReturnUrl: string | null;
  user: User;
}

export const PortalSessaoTemporariaWhatsapp: React.FC<PortalSessaoTemporariaWhatsappProps> = ({
  token,
  onExitToApp
}) => {
  const previousUserRef = useRef<User | null>(storage.getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ title: string; detail: string; concluded?: boolean } | null>(null);
  const [sessionData, setSessionData] = useState<TempSessionData | null>(null);
  const [activeTab, setActiveTab] = useState<CautelaCategoryTab>('armas');
  const [preselectedLinkedWeaponCautelaId, setPreselectedLinkedWeaponCautelaId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [concludedInfo, setConcludedInfo] = useState<{
    message: string;
    whatsappReturnUrl: string | null;
    whatsappNotified: boolean;
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Scoped domain state hydrated for the temporary user
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vaultSpaces, setVaultSpaces] = useState<VaultSpace[]>([]);
  const [calibers, setCalibers] = useState<Caliber[]>([]);
  const [ammoStocks, setAmmoStocks] = useState<AmmunitionStock[]>([]);
  const [weapons, setWeapons] = useState<Weapon[]>([]);

  const hydrateUserData = useCallback(async (user: User) => {
    storage.setCurrentUser(user);
    await storage.refreshFromServer();
    const freshUser = storage.getCurrentUser() || user;
    setDepartments(storage.getDepartments(freshUser));
    setUnits(storage.getUnits(freshUser));
    setVaultSpaces(storage.getVaultSpaces(freshUser));
    setCalibers(storage.getCalibers());
    setAmmoStocks(storage.getAmmoStocks(freshUser));
    setWeapons(storage.getWeapons(freshUser));
  }, []);

  const restorePreviousSession = useCallback(() => {
    storage.setCurrentUser(previousUserRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoading(true);
      setErrorState(null);
      try {
        const res = await fetch(`/api/whatsapp/sessao-temporaria/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!active) return;

        if (!res.ok || !data?.valid || !data?.user) {
          setErrorState({
            title: data?.status === 'CONCLUIDA' ? 'Sessão já concluída' : 'Sessão temporária indisponível',
            detail: data?.message || data?.error || 'Link inválido ou expirado. Solicite um novo acesso pelo WhatsApp.',
            concluded: data?.status === 'CONCLUIDA'
          });
          setLoading(false);
          return;
        }

        const sess: TempSessionData = {
          sessionId: data.sessionId,
          tipoFluxo: data.tipoFluxo,
          expiresAt: data.expiresAt,
          fromPhone: data.fromPhone,
          whatsappReturnUrl: data.whatsappReturnUrl || null,
          user: data.user
        };
        setSessionData(sess);

        const expMs = new Date(sess.expiresAt).getTime();
        if (!Number.isNaN(expMs)) {
          setRemainingSeconds(Math.max(0, Math.floor((expMs - Date.now()) / 1000)));
        }

        await hydrateUserData(sess.user);
      } catch (err: any) {
        if (!active) return;
        setErrorState({
          title: 'Falha ao validar sessão',
          detail: err?.message || 'Não foi possível validar o link de acesso temporário.'
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    init();

    return () => {
      active = false;
      restorePreviousSession();
    };
  }, [token, hydrateUserData, restorePreviousSession]);

  // Countdown timer
  useEffect(() => {
    if (!sessionData || concludedInfo) return;
    const timer = window.setInterval(() => {
      const expMs = new Date(sessionData.expiresAt).getTime();
      if (!Number.isNaN(expMs)) {
        const left = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
        setRemainingSeconds(left);
        if (left === 0) {
          setErrorState({
            title: 'Sessão temporária expirada',
            detail: 'O tempo limite de 30 minutos foi atingido. Solicite um novo link pelo WhatsApp.'
          });
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionData, concludedInfo]);

  const handleRefresh = useCallback(async () => {
    if (!sessionData) return;
    await hydrateUserData(sessionData.user);
  }, [sessionData, hydrateUserData]);

  const handleConcluir = async () => {
    if (!sessionData || finishing) return;
    setFinishing(true);
    try {
      const res = await fetch(`/api/whatsapp/sessao-temporaria/${encodeURIComponent(token)}/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorState({
          title: 'Não foi possível concluir a sessão',
          detail: data?.error || 'Sessão expirada ou já encerrada.'
        });
        return;
      }

      restorePreviousSession();
      setConcludedInfo({
        message: data.message || 'Aguardando deferimento do responsável pela armaria para emitir recibo.',
        whatsappReturnUrl: data.whatsappReturnUrl || sessionData.whatsappReturnUrl || null,
        whatsappNotified: Boolean(data.whatsappNotified)
      });
    } catch (err: any) {
      setErrorState({
        title: 'Erro de conexão',
        detail: err?.message || 'Erro ao finalizar a sessão temporária.'
      });
    } finally {
      setFinishing(false);
    }
  };

  const handleExit = () => {
    restorePreviousSession();
    onExitToApp();
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isDevolucao = sessionData?.tipoFluxo === 'DEVOLVER_CAUTELA';
  const userUnitName = units.find(u => u.id === sessionData?.user.unitId)?.name;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-sm w-full bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <RefreshCw className="w-7 h-7 animate-spin" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">Autenticando Sessão Temporária</h1>
            <p className="text-xs text-slate-400 mt-1">
              Validando suas permissões e carregando o acervo da armaria...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (concludedInfo) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[11px] font-black uppercase">
              {isDevolucao ? 'Devolução de Cautela Registrada' : 'Solicitação de Cautela Registrada'}
            </span>
            <h1 className="text-xl font-black text-white">Processo Concluído com Sucesso</h1>
            <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/35 rounded-xl p-4 font-semibold leading-relaxed">
              {concludedInfo.message}
            </p>
            <p className="text-xs text-slate-400">
              {concludedInfo.whatsappNotified
                ? 'Esta confirmação também foi enviada diretamente no seu WhatsApp.'
                : 'Sessão temporária encerrada com segurança. Você já pode retornar para a conversa no WhatsApp.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {concludedInfo.whatsappReturnUrl && (
              <a
                href={concludedInfo.whatsappReturnUrl}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Voltar para o WhatsApp</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleExit}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Sistema</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (errorState || !sessionData) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div
            className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center border ${
              errorState?.concluded
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-red-500/15 border-red-500/40 text-red-400'
            }`}
          >
            {errorState?.concluded ? <CheckCircle2 className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-black text-white">{errorState?.title || 'Sessão indisponível'}</h1>
            <p className="text-xs text-slate-300 leading-relaxed">{errorState?.detail}</p>
          </div>
          <button
            type="button"
            onClick={handleExit}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ir para o Sistema Principal</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Cabeçalho da Sessão Temporária WhatsApp */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-emerald-500/35 px-4 py-3 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-amber-500/40 p-1 flex items-center justify-center shrink-0">
              <img src={DEFAULT_SYSTEM_LOGO} alt="PCMG" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  <span>Sessão Temporária WhatsApp</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                    isDevolucao
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {isDevolucao ? 'Fluxo: Devolver Cautelas' : 'Fluxo: Solicitar Cautelas'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Expira em {formatCountdown(remainingSeconds)}</span>
                </span>
              </div>
              <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-2">
                <span className="font-bold text-white flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  {sessionData.user.name}
                </span>
                <span className="text-slate-500">•</span>
                <span className="font-mono text-slate-400">MASP {sessionData.user.masp}</span>
                {userUnitName && (
                  <>
                    <span className="text-slate-500">•</span>
                    <span className="text-amber-300 font-semibold">{userUnitName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={finishing}
              onClick={handleConcluir}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-2 shadow transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{finishing ? 'Finalizando...' : 'Concluir e Voltar para o WhatsApp'}</span>
            </button>
            <button
              type="button"
              onClick={handleExit}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition"
              title="Sair sem encerrar"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Aviso orientativo do fluxo */}
      <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 pt-4 space-y-4">
        <div
          className={`rounded-2xl border p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            isDevolucao
              ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-100'
              : 'bg-amber-500/10 border-amber-500/35 text-amber-100'
          }`}
        >
          <div>
            <strong className="uppercase font-black">
              {isDevolucao ? 'Devolução de Cautelas:' : 'Solicitação de Cautelas:'}
            </strong>{' '}
            {isDevolucao
              ? 'Selecione abaixo a categoria (Armas, Munições ou Materiais), localize sua cautela ativa e realize a devolução normal. Ao finalizar, clique em "Concluir e Voltar para o WhatsApp".'
              : 'Selecione abaixo a categoria (Armas, Munições ou Materiais) e siga o fluxo normal de solicitação de cautela. Ao finalizar, clique em "Concluir e Voltar para o WhatsApp".'}
          </div>
        </div>

        {/* Seletor de Categoria: Armas, Munições e Materiais */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('armas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'armas'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>Armas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('municoes')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'municoes'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
          >
            <Disc className="w-4 h-4" />
            <span>Munições</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('materiais')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'materiais'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Materiais</span>
          </button>
        </div>

        {/* Módulo Real da Categoria Selecionada */}
        <main className="pb-10">
          {activeTab === 'armas' && (
            <ModuloCautelaArmas
              currentUser={sessionData.user}
              weapons={weapons}
              ammoStocks={ammoStocks}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
              units={units}
              departments={departments}
              onStartLinkedAmmoCautela={cautela => {
                setPreselectedLinkedWeaponCautelaId(cautela.id);
                setActiveTab('municoes');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onRefresh={handleRefresh}
            />
          )}

          {activeTab === 'municoes' && (
            <ModuloCautelaMunicoes
              currentUser={sessionData.user}
              weapons={weapons}
              ammoStocks={ammoStocks}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
              units={units}
              departments={departments}
              preselectedLinkedWeaponCautelaId={preselectedLinkedWeaponCautelaId}
              onClearPreselectedLinkedWeaponCautela={() => setPreselectedLinkedWeaponCautelaId(null)}
              onRefresh={handleRefresh}
            />
          )}

          {activeTab === 'materiais' && (
            <ModuloCautelaMateriais
              currentUser={sessionData.user}
              vaultSpaces={vaultSpaces}
              units={units}
              departments={departments}
              onRefresh={handleRefresh}
            />
          )}
        </main>
      </div>
    </div>
  );
};
