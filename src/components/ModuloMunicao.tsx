@@
             <div className="flex items-center justify-between py-1 px-1 shrink-0">
               <span className="text-xs text-slate-400 font-mono">
                 {candidateAmmoVaults.length} cofre(s) de munições encontrado(s)
               </span>
-              <div className="flex items-center space-x-2 text-xs">
+              <div className="flex items-center gap-3 text-xs">
+                <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
+                  <input
+                    type="checkbox"
+                    checked={skipEmptyVaults}
+                    onChange={() => {
+                      const nextValue = !skipEmptyVaults;
+                      setSkipEmptyVaults(nextValue);
+
+                      if (nextValue) {
+                        setSelectedVaultIdsForReport(prev => prev.filter(id => {
+                          const vault = candidateAmmoVaults.find(v => v.id === id);
+                          if (!vault) return false;
+                          const total = stocks
+                            .filter(s => s.vaultSpaceId === vault.id)
+                            .reduce((sum, s) => sum + s.quantity, 0);
+                          return total > 0;
+                        }));
+                      }
+                    }}
+                    className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
+                  />
+                  <span>Não imprimir cofres vazios</span>
+                </label>
                 <button
                   type="button"
                   onClick={() => setSelectedVaultIdsForReport(candidateAmmoVaults.map(v => v.id))}
                   className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs"
                 >
                   Selecionar Todos
                 </button>
                 <span className="text-slate-600">|</span>
                 <button
                   type="button"
                   onClick={() => setSelectedVaultIdsForReport([])}
                   className="text-slate-400 hover:text-slate-200 font-semibold underline text-xs"
                 >
                   Desmarcar Todos
                 </button>
               </div>
             </div>
+
+            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
+              Os cofres vazios ficam desmarcados por padrão. Se quiser imprimir mesmo assim, basta marcar o cofre manualmente.
+            </div>
