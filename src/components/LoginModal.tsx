import React, { useState } from 'react';
import { cleanMasp, formatMasp } from '../utils/masks';
import { Shield, Lock, User, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (maspDigits: string, passwordDigits: string) => void;
  error?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, error }) => {
  const [maspRaw, setMaspRaw] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleMaspChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Input accepts ONLY digits
    const clean = cleanMasp(e.target.value);
    setMaspRaw(clean);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!maspRaw) {
      setLocalError('Por favor, informe o MASP.');
      return;
    }
    if (!password) {
      setLocalError('Por favor, informe a senha.');
      return;
    }

    onLoginSuccess(maspRaw, password);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border-b border-slate-800 text-center relative">
          <div className="inline-flex p-3 bg-amber-500 text-slate-950 rounded-xl shadow-lg mb-3">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-100 font-mono tracking-wider">ARMERIA</h2>
          <p className="text-xs text-amber-400 font-medium uppercase tracking-widest mt-1">
            Polícia Civil • Gestão de Armas e Munições
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {(error || localError) && (
            <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error || localError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              MASP (Apenas números)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={formatMasp(maspRaw)}
                onChange={handleMaspChange}
                placeholder="Ex: 1.255.748-0"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-mono"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Digitação restrita a números. Formatação automática.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Senha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-mono"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl shadow-lg transition duration-200 flex items-center justify-center space-x-2 text-sm"
          >
            <span>ENTRAR NO SISTEMA</span>
          </button>
        </form>

        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500">
            Acesso restrito a policiais civis autorizados. Todas as ações são auditadas.
          </p>
        </div>
      </div>
    </div>
  );
};
