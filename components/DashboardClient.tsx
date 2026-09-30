
[Ver el archivo completo para obtener las líneas anteriores...]

  // User Chooses: Direct Local Download to Device (Backend-Authoritative)
  const handleExecuteLocalDownload = async (verifiedSessionId?: string, event?: React.MouseEvent) => {
    // Prevenir comportamiento por defecto del navegador
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!discoveredData) return;

    const title = discoveredData.title || 'descarga_megiddo_ray';
    const ext = discoveredData.type === 'video' ? 'mp4' : discoveredData.type === 'image' ? 'jpg' : 'zip';
    const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    const rawTargetUrl = discoveredData.url || discoveredData.cleanUrl || discoveredData.originalUrl || newUrl;

    // 1. For video or image media: Validate & resolve using backend prepare phase
    if (discoveredData.type === 'video' || discoveredData.type === 'image') {
      showToast(t('verifyingMediaStream'));

      try {
        const prepRes = await fetch('/api/download/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: rawTargetUrl,
            candidateUrl: discoveredData.directResourceUrl || discoveredData.resolvedDownload?.url,
            filename: safeFilename,
            expectedType: discoveredData.type,
            estimatedSize: discoveredData.estimatedSizeBytes,
            duration: discoveredData.duration,
            sessionId: verifiedSessionId || discoveredData.sessionId,
          }),
        });

        if (!prepRes.ok) {
          const errData = await prepRes.json().catch(() => ({}));
          if (errData.requiresSession || errData.canVerify) {
            showToast(t('resourceRequiresVerificationToast'));
            handleStartVerificationFlow(rawTargetUrl, errData.provider || discoveredData.platform, errData.sessionId);
            return;
          }
          showToast(errData.reason || errData.message || t('localDownloadUnavailableInternalFallback'));
          handleExecuteInternalDownload();
          return;
        }

        const capability = await prepRes.json();

        if (capability.requiresSession || capability.canVerify) {
          showToast(t('resourceRequiresVerificationToast'));
          handleStartVerificationFlow(rawTargetUrl, capability.provider || discoveredData.platform, capability.sessionId);
          return;
        }

        if (capability.sessionInvalid) {
          showToast(t('sessionExpiredOrInvalidToast'));
          handleStartVerificationFlow(rawTargetUrl, capability.provider || discoveredData.platform);
          return;
        }

        if (!capability.available || capability.mode === 'unavailable') {
          showToast(capability.reason || t('localDirectUnavailableUsingInternal'));
          handleExecuteInternalDownload();
          return;
        }

        // Backend authoritative routing: always wrap external URLs into same-origin proxy
        let downloadUrl = '';
        if (capability.mode === 'direct' && capability.url) {
          const isRemote = capability.url.startsWith('http://') || capability.url.startsWith('https://');
          if (isRemote && !capability.url.startsWith(window.location.origin)) {
            downloadUrl = `/api/download/direct?url=${encodeURIComponent(capability.url)}&filename=${encodeURIComponent(capability.filename || safeFilename)}`;
          } else {
            downloadUrl = capability.url;
          }
        } else if (capability.mode === 'proxy' && (capability.downloadUrl || capability.token)) {
          downloadUrl = capability.downloadUrl || `/api/download/file?token=${capability.token}&filename=${encodeURIComponent(capability.filename || safeFilename)}`;
        }

        // VALIDACIÓN CRÍTICA: Asegurar que la URL no esté vacía
        if (!downloadUrl || downloadUrl.trim() === '') {
          console.error('Download URL is empty or invalid');
          showToast(t('couldNotGenerateSecureUrl'));
          handleExecuteInternalDownload();
          return;
        }

        // Trigger verified same-origin browser native download
        // Usar un enlace temporal con target="_blank" para evitar comportamientos inesperados
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = capability.filename || safeFilename;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        
        // Asegurar que el enlace no tenga comportamiento por defecto
        link.onclick = (e) => {
          e.stopPropagation();
        };
        
        document.body.appendChild(link);
        
        // Pequeño delay para asegurar que el DOM esté listo
        await new Promise(resolve => setTimeout(resolve, 50));
        
        link.click();
        
        // Limpieza inmediata
        setTimeout(() => {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
        }, 100);
        
        showToast(t('downloadingDirectlyToDevice'));
      } catch (prepErr) {
        console.warn('Download preparation error:', prepErr);
        showToast(t('downloadPrepCommunicationError'));
        handleExecuteInternalDownload();
        return;
      }
    } else if (discoveredData.type === 'manga' && discoveredData.items && discoveredData.items.length > 0) {
      // For manga or batch collection in local mode:
      const selected = discoveredData.items.filter(it => discoveredSelectedChapters[it.id]);
      const manifestData = {
        title: discoveredData.title,
        platform: discoveredData.platform,
        url: discoveredData.url,
        chapters: selected.map(it => ({ id: it.id, name: it.name, url: it.url, pages: it.pageCount }))
      };
      const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: 'application/json' });
      const manifestUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = manifestUrl;
      link.download = `${title}_enlaces_directos.json`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(manifestUrl);
    }

    // 2. Register Tracker in local mode so user can see it in dashboard
    const embedUrl = discoveredData.videoEmbedUrl || (discoveredData.previewUrl?.includes('embed') ? discoveredData.previewUrl : undefined);
    const resolvedPreview = discoveredData.previewUrl || discoveredData.videoPreview?.previewUrl;

    const newTracker: Tracker = {
      id: uuidv4(),
      url: discoveredData.url || discoveredData.originalUrl || newUrl || '',
      title: discoveredData.title,
      author: discoveredData.author,
      authorUrl: discoveredData.authorUrl,
      category: discoveredData.type === 'video' ? 'video' : discoveredData.type === 'image' ? 'image' : 'manga',
      mode: newMode,
      status: 'completed',
      progress: 100,
      downloadSpeed: 'Local (Directo al dispositivo)',
      downloadMode: 'local',
      imageCount: discoveredData.totalPages || 1,
      images: discoveredData.thumbnailUrl ? [discoveredData.thumbnailUrl] : [],
      mediaType: discoveredData.type === 'video' ? 'video' : 'image',
      dateAdded: new Date().toISOString(),
      thumbnailUrl: discoveredData.thumbnailUrl,
      estimatedSizeBytes: discoveredData.estimatedSizeBytes,
      estimatedSizeFormatted: discoveredData.estimatedSizeFormatted,
      videoUrl: discoveredData.directResourceUrl,
      videoEmbedUrl: embedUrl,
      previewUrl: resolvedPreview,
      previewDiagnostics: discoveredData.videoPreviewDiagnostics,
      isDirectLocalAvailable: true,
      totalChapters: discoveredData.totalItems || 1,
      completedChapters: discoveredData.totalItems || 1
    };

    setTrackers(prev => [newTracker, ...prev]);
    setShowNewModal(false);
    setDiscoveredData(null);
    setNewUrl('');
    showToast(t('localDownloadSent'));
  };

[Ver el archivo completo para obtener las líneas posteriores...]
