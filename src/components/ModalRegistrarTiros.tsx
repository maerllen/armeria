import React, { useState, useEffect } from 'react';
import { User, Weapon, WeaponShotRecord } from '../types';
import { storage } from '../services/storage';
import { Crosshair, Plus, History, X, Check, Calendar, UserCheck, FileText, AlertCircle } from 'lucide-react';
import { formatTimestamp } from '../utils/masks';

interface ModalRegistrarTirosProps {
  weapon: Weapon;
  currentUser: User;
  onClose: () => void;
  onSuccess: (newTotal: number) => void;
}

export const ModalRegistrarTiros: React.FC<ModalRegistrarTirosProps> = ({
  weapon,
  currentUser,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'history'>('register');
  const [shotCount, setShotCount] = useState<number>(50);
  const [officerName, setOfficerName] = useState<string>(currentUser.name || '');
  const [officerMasp, setOfficerMasp] = useState<string>(currentUser.masp || '');
  const [reason, setReason] = useState<string>('Treinamento de Tiro');
  const [customReason, setCustomReason] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // History state
  const [historyList, setHistoryList] = useState<WeaponShotRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const currentTotal = Number(weapon.shotCount) || 0;
  const projectedTotal = currentTotal + (Number(shotCount) || 0);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const records = await storage.getWeaponShots(weapon.id);
      setHistoryList(records);
    } catch (err: any) {
      console.error('Erro ao carregar histórico de disparos:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const count = Number(shotCount);
    if (!count || count <= 0) {
      setErrorMsg('Informe uma quantidade válida de tiros disparados.');
      return;
    }
    if (!officerName.trim()) {
      setErrorMsg('Informe o nome do policial responsável pelo disparo / instrução.');
      return;
    }

    const finalReason = reason === 'Outro' ? (customReason.trim() || 'Outro') : reason;

    try {
      setLoading(true);
      const res = await storage.addWeaponShots(
        weapon.id,
        count,
        finalReason,
        officerName.trim(),
        officerMasp.trim()
      );
      onSuccess(res.newTotal);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar disparos da arma.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Registro de Disparos / Quantidade de Tiros
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {weapon.manufacturer} {weapon.model} • Nº de Série: <span className="text-amber-400 font-bold">{weapon.serialNumber}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-800 space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'register'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Lançar Disparos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'history'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico de Tiros ({currentTotal} disparos)</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {activeTab === 'register' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Shot Counter Visual Banner */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl text-center">
              <div className="border-r border-slate-800 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Tiros Atuais Registrados
                </span>
                <span className="text-xl font-bold font-mono text-slate-200">
                  {currentTotal.toLocaleString('pt-BR')}
                </span>
                <span className="text-[10px] text-slate-400 block">disparos</span>
              </div>
              <div className="pl-2">
                <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">
                  Total após este Registro
                </span>
                <span className="text-xl font-bold font-mono text-amber-400">
                  {projectedTotal.toLocaleString('pt-BR')}
                </span>
                <span className="text-[10px] text-amber-400/80 block">disparos acumulados</span>
              </div>
            </div>

            {/* Form Fields */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Quantidade de Tiros Disparados *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shotCount}
                  onChange={(e) => setShotCount(parseInt(e.target.value, 10) || 0)}
                  placeholder="Ex: 50"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-bold text-amber-400 font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-semibold">tiros</span>
              </div>
              {/* Quick Increment Buttons */}
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-[11px] text-slate-400">Atalhos:</span>
                {[20, 50, 100, 150, 200].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setShotCount(val)}
                    className="px-2.5 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                  >
                    +{val}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Policial / Atirador Responsável *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                    placeholder="Nome completo..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                  <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  MASP do Policial
                </label>
                <input
                  type="text"
                  value={officerMasp}
                  onChange={(e) => setOfficerMasp(e.target.value)}
                  placeholder="Ex: 1234567"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Motivo / Atividade *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="Treinamento de Tiro">Treinamento de Tiro</option>
                  <option value="Instrução Tática">Instrução Tática</option>
                  <option value="Aferição / Calibração">Aferição / Calibração</option>
                  <option value="Teste de Funcionamento">Teste de Funcionamento</option>
                  <option value="Competição / Estande">Competição / Estande</option>
                  <option value="Ação Operacional">Ação Operacional</option>
                  <option value="Outro">Outro Motivo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Data dos Disparos
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>
            </div>

            {reason === 'Outro' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Descreva o Motivo
                </label>
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Detalhe a finalidade do uso..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? 'Gravando...' : 'Salvar Quantidade de Tiros'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* Shot History List */
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Carregando histórico de tiros...
              </div>
            ) : historyList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl italic">
                Nenhum registro individual de tiros lançado ainda para esta arma.
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {historyList.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-amber-400 text-sm font-mono">
                          +{rec.shotCount} tiros
                        </span>
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-semibold">
                          {rec.reason}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Policial: <strong className="text-slate-200">{rec.officerName}</strong>
                        {rec.officerMasp && <span> (MASP: {rec.officerMasp})</span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">
                        {formatTimestamp(rec.createdAt)}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Total acumulado: <strong className="text-slate-200">{rec.totalShotsAfter}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
