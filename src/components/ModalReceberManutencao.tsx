import React, { useState, useEffect } from 'react';
import { User, Weapon, WeaponMaintenance, VaultSpace } from '../types';
import { storage } from '../services/storage';
import { CheckCircle2, X, Calendar, UserCheck, Wrench, Building, AlertCircle, RotateCcw, ShieldCheck, Shield } from 'lucide-react';
import { formatTimestamp } from '../utils/masks';

interface ModalReceberManutencaoProps {
  weapon: Weapon;
  currentUser: User;
  vaultSpaces: VaultSpace[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ModalReceberManutencao: React.FC<ModalReceberManutencaoProps> = ({
  weapon,
  currentUser,
  vaultSpaces,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeMaint, setActiveMaint] = useState<WeaponMaintenance | null>(null);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [returnArmorerName, setReturnArmorerName] = useState<string>(currentUser.name || '');
  const [registeredArmorers, setRegisteredArmorers] = useState<User[]>([]);
  const [selectedArmorerUserId, setSelectedArmorerUserId] = useState<string>('');
  const [serviceDescription, setServiceDescription] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    loadActiveMaintenance();
    // Carregar armeiros cadastrados
    const users = storage.getUsers();
    const armorers = users.filter(u =>
      u.role === 'Armeiro' ||
      u.role === 'Geral' ||
      u.role === 'Administrador' ||
      (u.cargo && u.cargo.toLowerCase().includes('armeiro'))
    );
    const list = armorers.length > 0 ? armorers : users;
    setRegisteredArmorers(list);

    if (currentUser) {
      const match = list.find(u => u.id === currentUser.id || u.name === currentUser.name);
      if (match) {
        setSelectedArmorerUserId(match.id);
        if (!returnArmorerName) setReturnArmorerName(match.name);
      }
    }
  }, [weapon.id]);

  const loadActiveMaintenance = async () => {
    try {
      setLoading(true);
      const list = await storage.getMaintenances(weapon.id);
      const ongoing = list.find(m => m.status === 'EM_ANDAMENTO');
      if (ongoing) {
        setActiveMaint(ongoing);
      } else if (list.length > 0) {
        // Fallback to most recent
        setActiveMaint(list[0]);
      }
    } catch (err: any) {
      console.error('Erro ao buscar manutenção:', err);
    } finally {
      setLoading(false);
    }
  };

  // Target return vault space
  const targetVaultId = activeMaint?.originalVaultSpaceId || weapon.previousVaultSpaceId || weapon.vaultSpaceId;
  const targetVaultCode = vaultSpaces.find(v => v.id === targetVaultId)?.code || targetVaultId || 'Cofre Principal';

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!serviceDescription.trim()) {
      setErrorMsg('Informe o tipo de serviço que foi realizado na arma.');
      return;
    }
    if (!returnArmorerName.trim()) {
      setErrorMsg('Informe o armeiro responsável pelo recebimento.');
      return;
    }

    if (!activeMaint) {
      setErrorMsg('Registro de manutenção em andamento não encontrado.');
      return;
    }

    try {
      setSubmitting(true);
      await storage.receiveWeaponFromMaintenance(activeMaint.id, {
        returnDate,
        returnArmorerName: returnArmorerName.trim(),
        returnServiceDescription: serviceDescription.trim()
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao receber arma da manutenção.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Receber Arma da Manutenção
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

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Localizando registro de manutenção...
          </div>
        ) : (
          <form onSubmit={handleConfirmReceive} className="space-y-4">
            
            {/* Maintenance Summary Box */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Dados do Envio para Manutenção</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {activeMaint?.type === 'Externa' ? 'Manutenção Externa' : 'Manutenção Interna'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Data de Envio:</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    {activeMaint?.sentDate ? formatTimestamp(activeMaint.sentDate) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Armeiro do Envio:</span>
                  <span className="text-slate-200 font-semibold">{activeMaint?.sentArmorerName || 'N/A'}</span>
                </div>
                {activeMaint?.type === 'Externa' && activeMaint.workshopName && (
                  <div className="col-span-2 p-2.5 bg-purple-950/20 border border-purple-900/30 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-300 font-bold text-[11px] flex items-center space-x-1.5">
                        <Building className="w-3.5 h-3.5" />
                        <span>Armeria: {activeMaint.workshopName} {activeMaint.workshopCity ? `(${activeMaint.workshopCity} - ${activeMaint.workshopState})` : ''}</span>
                      </span>
                      {activeMaint.workshopCredenciamentoPf && (
                        <span className="text-[10px] text-purple-300 font-mono bg-purple-900/40 px-2 py-0.5 rounded border border-purple-700/50 flex items-center space-x-1">
                          <Shield className="w-3 h-3 text-purple-400" />
                          <span>Cred. PF: {activeMaint.workshopCredenciamentoPf}</span>
                        </span>
                      )}
                    </div>
                    {activeMaint.workshopArmorerName && (
                      <div className="text-[11px] text-slate-300 flex items-center space-x-1">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>Armeiro da Armeria: <strong className="text-slate-100">{activeMaint.workshopArmorerName}</strong></span>
                      </div>
                    )}
                  </div>
                )}
                {activeMaint?.sentDescription && activeMaint?.type === 'Interna' && (
                  <div className="col-span-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800 text-slate-300">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase mb-0.5">Descrição Informada no Envio:</span>
                    <p className="italic">{activeMaint.sentDescription}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Target Vault Restoration Notice */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-emerald-300">Retorno Automático ao Cofre</div>
                  <div className="text-[11px] text-emerald-400/80">
                    O armamento retornará automaticamente para o local de guarda: <strong className="text-emerald-300 font-mono">{targetVaultCode}</strong>
                  </div>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded font-mono">
                STATUS: No Cofre
              </span>
            </div>

            {/* Form Inputs: Armeiro, Data, Tipo de Serviço Realizado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Data de Recebimento *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Armeiro que Recebeu *
                  </label>
                  <span className="text-[10px] text-slate-400">Selecione ou digite</span>
                </div>
                <div className="space-y-1.5">
                  <select
                    value={selectedArmorerUserId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedArmorerUserId(val);
                      if (val !== 'MANUAL' && val) {
                        const found = registeredArmorers.find(u => u.id === val);
                        if (found) setReturnArmorerName(found.name);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none font-medium"
                  >
                    <option value="">-- Selecionar da lista de Armeiros Cadastrados --</option>
                    {registeredArmorers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {u.masp} • {u.cargo || u.role})
                      </option>
                    ))}
                    <option value="MANUAL">Digitar armeiro manualmente...</option>
                  </select>

                  <div className="relative">
                    <input
                      type="text"
                      value={returnArmorerName}
                      onChange={(e) => {
                        setReturnArmorerName(e.target.value);
                        if (selectedArmorerUserId !== 'MANUAL') {
                          const matches = registeredArmorers.find(u => u.id === selectedArmorerUserId)?.name === e.target.value;
                          if (!matches) setSelectedArmorerUserId('MANUAL');
                        }
                      }}
                      placeholder="Nome do armeiro que recebeu..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                      required
                    />
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Campo de texto: Descrição da Manutenção Realizada */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Descrição da Manutenção Realizada *
              </label>
              <textarea
                rows={4}
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                placeholder="Ex: Realizada troca do percursor e mola recuperadora; efetuado ajuste no extrator; arma testada com 20 disparos em estande sem ocorrência de pane; aprovada para retorno ao serviço operacional."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none leading-relaxed"
                required
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Informe o laudo técnico do serviço efetuado, trocas efetuadas e observações de testes pela armeria para retorno ao cofre.
              </span>
            </div>

            {/* Actions */}
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
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Confirmando...' : 'Confirmar Recebimento e Retornar ao Cofre'}</span>
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
