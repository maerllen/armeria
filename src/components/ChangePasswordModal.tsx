import React, { useState } from 'react';
import { User } from '../types';
import { storage } from '../services/storage';
import { KeyRound, Lock, AlertCircle, CheckCircle2, ShieldAlert, LogOut } from 'lucide-react';

interface ChangePasswordModalProps {
  user: User;
  isMandatory?: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
  error?: string;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  user,
  isMandatory = false,
  onSuccess,
  onCancel,
  error: externalError
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedNew) {
      setLocalError('Informe a nova senha.');
      return;
    }

    if (trimmedNew.length < 6) {
      setLocalError('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setLocalError('A confirmação de senha não confere com a nova senha.');
      return;
    }

    // Mandatory Rule: Cannot use MASP as new password
    if (user && trimmedNew === user.masp) {
      setLocalError('A nova senha não pode ser igual ao seu número de MASP.');
      return;
    }

    const res = await storage.changePassword(user.id, trimmedNew);
    if (!res.success) {
      setLocalError(res.error || 'Erro ao alterar a senha.');
      return;
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-800/80 p-5 border-b border-slate-700 flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 font-mono">
              {isMandatory ? 'Primeiro Acesso - Troca de Senha' : 'Alterar Senha de Acesso'}
            </h3>
            <p className="text-xs text-slate-400">
              {isMandatory
                ? 'Sua senha é o seu MASP. É obrigatório criar uma nova senha.'
                : 'Atualize sua senha de segurança do sistema.'}
            </p>
          </div>
        </div>

        {/* Warning Badge for first login / mandatory */}
        {isMandatory && (
          <div className="bg-amber-950/60 border-b border-amber-800/50 p-3 px-5 text-amber-200 text-xs flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Sua senha atual é o seu MASP. Por segurança, redefina-a agora para continuar.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(externalError || localError) && (
            <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{externalError || localError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nova Senha (Mínimo 6 caracteres)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha (qualquer caractere)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                required
                minLength={6}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Pode conter letras, números e caracteres especiais (no mínimo 6 dígitos/caracteres).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition flex items-center space-x-1"
              >
                {isMandatory && <LogOut className="w-3.5 h-3.5 mr-1" />}
                <span>{isMandatory ? 'Sair' : 'Cancelar'}</span>
              </button>
            )}
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl shadow transition text-xs font-mono"
            >
              SALVAR NOVA SENHA
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
