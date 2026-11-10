@@
   // Modal de Seleção de Cofres para Impressão
   const [showPrintVaultSelectModal, setShowPrintVaultSelectModal] = useState(false);
   const [selectedVaultIdsForReport, setSelectedVaultIdsForReport] = useState<string[]>([]);
+  const [skipEmptyVaults, setSkipEmptyVaults] = useState(true);
@@
   const handleOpenPrintVaultModal = () => {
-    const defaultIds = candidateAmmoVaults.map(v => v.id);
-    setSelectedVaultIdsForReport(defaultIds);
+    const defaultIds = candidateAmmoVaults
+      .filter(v => {
+        const total = stocks
+          .filter(s => s.vaultSpaceId === v.id)
+          .reduce((sum, s) => sum + s.quantity, 0);
+        return total > 0;
+      })
+      .map(v => v.id);
+    setSelectedVaultIdsForReport(defaultIds);
+    setSkipEmptyVaults(true);
     setShowPrintVaultSelectModal(true);
   };
@@
   const handlePrintUnitAmmoReport = (vaultIdsToPrint?: string[]) => {
-    const targetVaults = (vaultIdsToPrint && vaultIdsToPrint.length > 0)
-      ? vaultSpaces.filter(v => v.type === 'MUNIÇÕES' && vaultIdsToPrint.includes(v.id))
-      : candidateAmmoVaults;
+    const targetVaultsBase = (vaultIdsToPrint && vaultIdsToPrint.length > 0)
+      ? vaultSpaces.filter(v => v.type === 'MUNIÇÕES' && vaultIdsToPrint.includes(v.id))
+      : candidateAmmoVaults;
+
+    const targetVaults = skipEmptyVaults
+      ? targetVaultsBase.filter(v => {
+          const total = stocks
+            .filter(s => s.vaultSpaceId === v.id)
+            .reduce((sum, s) => sum + s.quantity, 0);
+          return total > 0;
+        })
+      : targetVaultsBase;
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
-                  onClick={() => setSelectedVaultIdsForReport(candidateAmmoVaults.map(v => v.id))}
+                  onClick={() => {
+                    const allPrintableIds = candidateAmmoVaults
+                      .filter(v => {
+                        if (!skipEmptyVaults) return true;
+                        const total = stocks
+                          .filter(s => s.vaultSpaceId === v.id)
+                          .reduce((sum, s) => sum + s.quantity, 0);
+                        return total > 0;
+                      })
+                      .map(v => v.id);
+                    setSelectedVaultIdsForReport(allPrintableIds);
+                  }}
                   className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs"
                 >
                   Selecionar Todos
                 </button>
                 <span className="text-slate-600">|</span>
                 <button
                   type="button"
-                  onClick={() => setSelectedVaultIdsForReport([])}
+                  onClick={() => setSelectedVaultIdsForReport([])}
                   className="text-slate-400 hover:text-slate-200 font-semibold underline text-xs"
                 >
                   Desmarcar Todos
                 </button>
               </div>
@@
                 candidateAmmoVaults.map(v => {
                   const isChecked = selectedVaultIdsForReport.includes(v.id);
                   const vUnit = units.find(u => u.id === v.unitId);
                   const vStocks = stocks.filter(s => s.vaultSpaceId === v.id);
                   const vTotalQty = vStocks.reduce((sum, s) => sum + s.quantity, 0);
+                  const isEmpty = vTotalQty === 0;
 
                   return (
                     <label
                       key={v.id}
                       className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition select-none ${
@@
                           <div className="flex items-center space-x-2">
                             <span className="font-mono font-bold text-sm text-slate-100">{v.code}</span>
-                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
-                              COFRE PARA MUNIÇÕES
-                            </span>
+                            {isEmpty ? (
+                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
+                                COFRE VAZIO
+                              </span>
+                            ) : (
+                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
+                                COFRE PARA MUNIÇÕES
+                              </span>
+                            )}
                           </div>
                           <span className="text-[11px] text-slate-400">
                             Unidade: {vUnit ? vUnit.name : 'N/A'}
                           </span>
                         </div>
                       </div>
@@
               <button
                 type="button"
                 disabled={selectedVaultIdsForReport.length === 0}
                 onClick={() => {
                   setShowPrintVaultSelectModal(false);
                   handlePrintUnitAmmoReport(selectedVaultIdsForReport);
                 }}
                 className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow transition flex items-center space-x-2"
               >
                 <Printer className="w-4 h-4" />
                 <span>Imprimir Cofres Selecionados ({selectedVaultIdsForReport.length})</span>
               </button>
             </div>
           </div>
         </div>
       )}
