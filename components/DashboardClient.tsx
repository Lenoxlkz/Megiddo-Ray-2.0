                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                        {/* 1. Local Download Button */}
                        <motion.button
                          id="btn-download-local"
                          type="button"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (batchMetrics.requiresSession && !batchMetrics.canLocal) {
                              const rawTargetUrl = discoveredData?.url || discoveredData?.cleanUrl || newUrl;
                              handleStartVerificationFlow(rawTargetUrl, batchMetrics.provider);
                            } else {
                              handleExecuteLocalDownload(undefined, e as React.MouseEvent);
                            }
                          }}
                          disabled={!batchMetrics.canLocal && !batchMetrics.requiresSession}
                          whileHover={batchMetrics.canLocal || batchMetrics.requiresSession ? { scale: 1.02 } : {}}
                          whileTap={batchMetrics.canLocal || batchMetrics.requiresSession ? { scale: 0.98 } : {}}
                          transition={starosSpring}
                          className={cn(
                            "p-3.5 rounded-2xl border flex flex-col text-left transition-all select-none",
                            !batchMetrics.canLocal && !batchMetrics.requiresSession
                              ? "bg-white/5 opacity-40 border-white/5 text-neutral-500 cursor-not-allowed"
                              : batchMetrics.requiresSession && !batchMetrics.canLocal
                              ? "bg-amber-500/20 border-amber-400/60 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] ring-1 ring-amber-400/50 cursor-pointer"
                              : batchMetrics.recommendLocal
                              ? "bg-purple-500/30 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] ring-1 ring-purple-400 cursor-pointer"
                              : "bg-white/5 hover:bg-white/10 border-white/15 text-neutral-200 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <HardDrive className={cn("w-4 h-4 shrink-0", batchMetrics.canLocal ? "text-purple-400" : batchMetrics.requiresSession ? "text-amber-400" : "text-neutral-500")} />
                            <span>{t('downloadLocally')}</span>
                            {batchMetrics.requiresSession && !batchMetrics.canLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                {t('requiresSession')}
                              </span>
                            ) : !batchMetrics.canLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                {t('streamingUnavailable')}
                              </span>
                            ) : batchMetrics.recommendLocal && (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-purple-400/30 text-purple-200 border border-purple-400/50 uppercase font-bold">
                                {t('recommendedBadge')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-tight">
                            {batchMetrics.requiresSession && !batchMetrics.canLocal
                              ? t('requiresManualVerification')
                              : !batchMetrics.canLocal
                              ? t('sessionRequiredInternal')
                              : t('downloadLocallySub')}
                          </div>
                        </motion.button>

                        {/* 2. Internal Download Button (Unrestricted - No 280MB limit) */}
                        <motion.button
                          id="btn-download-internal"
                          type="button"
                          onClick={handleExecuteInternalDownload}
                          disabled={!batchMetrics.canInternal}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={starosSpring}
                          className={cn(
                            "p-3.5 rounded-2xl border flex flex-col text-left transition-all select-none",
                            !batchMetrics.canInternal
                              ? "bg-white/5 opacity-40 border-white/5 text-neutral-500 cursor-not-allowed"
                              : (!batchMetrics.canLocal || !batchMetrics.recommendLocal)
                              ? "bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400 cursor-pointer"
                              : "bg-white/5 opacity-80 border-white/10 text-neutral-300 hover:opacity-100 hover:bg-white/10 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <Server className={cn("w-4 h-4 shrink-0", batchMetrics.canInternal ? "text-emerald-400" : "text-neutral-500")} />
                            <span>{t('downloadInternally')}</span>
                            {!batchMetrics.canLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-400/30 text-emerald-200 border border-emerald-400/50 uppercase font-bold">
                                {t('recommendedBadge')}
                              </span>
                            ) : batchMetrics.recommendLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {t('highDemand')}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-tight">
                            {t('downloadInternallySub')}
                          </div>
                        </motion.button>
                      </div>
