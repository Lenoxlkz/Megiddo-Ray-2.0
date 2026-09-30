'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore } from 'react';

export type Language = 'en' | 'es';

export const translations = {
  en: {
    appTitle: 'Liquid Fast Download',
    tagline: 'Advanced search, streaming media and sequential data extraction engine.',
    enterUrl: 'Enter URL to track...',
    modeSingle: 'Single Chapter',
    modeSequential: 'Sequential Chapters',
    modeContinuous: 'Simultaneous Mode (Continuous)',
    startTracking: 'Start Tracking',
    trackingStatus: 'Status',
    tracking: 'Tracking',
    running: 'Downloading',
    completed: 'Completed',
    failed: 'Failed',
    error: 'Error',
    paused: 'Paused',
    idle: 'Idle',
    stopped: 'Stopped',
    imagesFound: 'Images / Frames',
    images: 'Images',
    exportPdf: 'Export PDF',
    exportPdfPdfLib: 'PDF (pdf-lib)',
    exportPdfImg2Pdf: 'PDF (img2pdf)',
    pdfLibDescription: 'Direct binary vector embed',
    img2PdfDescription: 'Direct 1:1 image-to-PDF packaging',
    previewView: 'Preview',
    fullView: 'Full View',
    generatingPdf: 'Generating PDF...',
    generatingPdfLib: 'Exporting (pdf-lib)...',
    generatingImg2Pdf: 'Exporting (img2pdf)...',
    emptyState: 'No active tracking tasks. Use the New Task button above to start extracting and downloading chapters.',
    noActiveTasks: 'No active tracking tasks',
    loading: 'Loading...',
    progress: 'Progress',
    speed: 'Speed',
    date: 'Date',
    controls: 'Controls',
    newTask: 'New Task',
    createNewTask: 'Create New Task',
    createTaskSubtitle: 'Enter the link and configure the extraction & download mode',
    mangaUrl: 'Target URL',
    videoUrlLabel: 'Video URL',
    imageUrlLabel: 'Image / Gallery URL',
    trackingMode: 'Tracking Mode',
    trackAllSimultaneously: 'Track all chapters simultaneously',
    trackAllOneAfterAnother: 'Track all chapters one after another',
    trackOnlyOneSpecified: 'Track only one specified chapter',
    cancel: 'Cancel',
    addTask: 'Add Task',
    restart: 'Restart',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    delete: 'Delete',
    pageNumber: 'Page / Frame',
    selectPdfEngine: 'Choose export engine',
    calculating: 'Calculating...',
    chapters: 'Chapters / Items',
    discoveringChapters: 'Discovering chapters...',
    chapter: 'Chapter',
    downloadingBatch: 'Downloading in parallel...',
    exportAllPdf: 'Export All (PDF)',
    exportChapter: 'Export PDF',
    pages: 'items',
    collapse: 'Collapse',
    expand: 'Expand',
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
    pending: 'Pending',
    downloading: 'Downloading...',
    customDownload: 'Custom Selection & Download',
    firstN: 'First',
    lastN: 'Last',
    atOnce: 'at once',
    downloadSelected: 'Download Selected',
    exportSelectedPdfLib: 'Export Selected (pdf-lib)',
    exportSelectedImg2Pdf: 'Export Selected (img2pdf)',
    exportCombinedSinglePdf: '1 Single PDF (pdf-lib ➜ img2pdf)',
    exportSelectedZipPdfs: 'ZIP Selection (PDFs)',
    exportSelectedCbzIndividual: 'CBZ Selection',
    exportIndividualPdfs: 'Export each cap. in an individual file',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    invertSelection: 'Invert',
    selectedCount: 'selected',
    quickPresets: 'Quick Presets',
    enterQuantity: 'Qty',
    apply: 'Select',
    checkboxMode: 'Checkbox Selection Mode',
    allCollapsedNotice: 'Chapters are collapsed by default for smooth visual performance',
    manageSelectionAndDownload: 'Custom Selection & Batch Download',
    closeSelectionPanel: 'Close Manager',
    openSelectionPanel: 'Custom Batches & Selection',
    batchDownloadDescription: 'Select chapters with checkboxes or quick presets to download and export in batch or individually.',
    searchCategory: 'Category',
    categoryManga: 'Manga',
    categoryVideo: 'Video',
    categoryImage: 'Image',
    categoryNsfw: 'Image',
    categoryMangaDesc: 'Comics, manhwas, webtoons (single, sequential, parallel) with PDF Export',
    categoryVideoDesc: 'YouTube, TikTok, Shorts, clips, playlists with MP4, MKV, WebM & MP3 Export',
    categoryImageDesc: 'TikTok photos, X / Twitter, Instagram & galleries with ZIP, CBZ, WebP Export',
    categoryNsfwDesc: 'TikTok photos, X / Twitter, Instagram & galleries with ZIP, CBZ, WebP Export',
    paste: 'Paste',
    clear: 'Clear',
    videoSingle: 'Single Video / Short',
    videoSequential: 'Sequential / Playlist',
    videoParallel: 'Batch Extraction',
    imageSingle: 'Single Image / Post',
    imageSequential: 'Sequential Thread / Gallery',
    imageParallel: 'Batch Image Extraction',
    nsfwVideoSingle: 'Single Image / Post',
    nsfwVideoSequential: 'Sequential Thread / Gallery',
    nsfwVideoParallel: 'Batch Image Extraction',
    videoPlayer: 'Video Player',
    authorBy: 'by',
    author: 'Author',
    link: 'Link',
    copiedToClipboard: 'copied to clipboard',
    selectedFirstN: 'Selected the first',
    selectedLastN: 'Selected the last',
    smartWaitMode: 'Smart Wait Mode (Recommended)',
    antiCrash: 'Anti-Crash',
    smartWaitModeDesc: 'Prevents broken chapters when manga and media servers take time to respond.',
    serverSlowResponse: 'The server took too long to respond when requesting this chapter.',
    retryWithWaitModeHint: 'You can retry now using Smart Wait Mode with automated rate limiting and pauses.',
    retryChapterWaitMode: 'Retry Chapter (Wait Mode)',
    copyAuthor: 'Copy author name',
    copyUrl: 'Copy URL',
    
    // Language capsule & switcher
    languageCapsuleTitle: 'Language',
    spanish: 'Spanish',
    english: 'English',
    currentLanguage: 'Current Language: English',
    switchLanguage: 'Switch to Spanish',
    languageSwitchedNotification: 'Switched to English',
    
    // Image Category Export
    exportImageZip: 'ZIP Package',
    exportImageCbz: 'CBZ Comic',
    exportImageWebp: 'WebP Batch',
    exportImageJpg: 'JPG Batch',
    exportImagePng: 'PNG Batch',
    exportSelectedZip: 'Export Selected (ZIP)',
    exportSelectedWebp: 'Export Selected (WebP)',
    packagingImages: 'Packaging images...',
    packagingZip: 'Compressing to ZIP...',
    packagingWebp: 'Converting to WebP...',

    // Video Category Export
    exportVideoMp4: 'Video (MP4)',
    exportVideoWebm: 'Video (WebM)',
    exportVideoMkv: 'Video (MKV)',
    exportAudioMp3: 'Audio (MP3)',
    exportSelectedVideo: 'Download Video (MP4)',
    exportSelectedAudio: 'Extract Audio (MP3)',
    exportingVideo: 'Exporting Video...',
    exportingAudio: 'Extracting MP3...',
    imageWithAudio: 'Image with Audio',
    exportImageAudioVideo: 'Export as Video (MP4)',
    exportAudioTrack: 'Export Audio (MP3)',
    exportImageOnly: 'Download Image',
    playAudio: 'Play Audio',
    pauseAudio: 'Pause Audio',
    synthesizingVideo: 'Generating MP4 Video from Image + Audio...',

    // Architectural Refactoring: Discovery, Metadata & Preparation
    prepareDownload: 'Prepare Download',
    analyzingContent: 'Analyzing content & inspecting metadata...',
    contentFound: 'Content Discovered',
    readyToDownload: 'Ready to Download',
    downloadInternally: 'Download Internally',
    downloadLocally: 'Download to Device (Local)',
    downloadInternallySub: 'Server processing & packaging (CBZ, PDF, ZIP, MP4)',
    downloadLocallySub: 'Direct device download via browser / Android download manager',
    serverGuardianTitle: 'Server Capacity Guardian ("Salvavidas")',
    recommendedLocalTitle: 'Local Download Recommended',
    recommendedLocalBanner: 'This file or selection is too large or server memory is high. Direct device download protects server stability.',
    serverSafeNotice: 'Optimal server capacity for internal processing.',
    estimatedSizeLabel: 'Estimated Size',
    durationLabel: 'Duration',
    resolutionLabel: 'Resolution',
    formatLabel: 'Format',
    chaptersFoundLabel: 'Chapters / Items Found',
    pagesFoundLabel: 'Total Pages / Frames',
    batchCalculationTitle: 'Batch Selection Calculation',
    directResourceLink: 'Direct Resource URL',
    copyDirectLink: 'Copy Direct Link',
    streamDownload: 'Stream to Device',

    // Streaming & Video Preview Resolver
    hideDiagnostics: 'Hide Diagnostics',
    showDiagnostics: 'View Streaming Diagnostics',
    diagnosticsTitle: 'Video Preview Resolver Internal Diagnostics',
    streamingReady: 'Ready for Streaming',
    streamingUnavailable: 'Not Available',
    streamingModeLabel: 'Streaming Mode',
    supportsRangeLabel: 'HTTP Range (206)',
    rangeCompatible: 'Compatible (206) ✅',
    rangeNotDetected: 'Not Detected ⚠️',
    contentTypeLabel: 'Content Type',
    originHeadersLabel: 'Origin Headers',
    requiresHeaders: 'Requires Headers',
    publicStandard: 'Public / Standard',
    sessionAuthLabel: 'Authentication',
    requiresSession: 'Requires Session',
    notRequired: 'Not Required',
    streamingHttpRange: 'Streaming HTTP Range (206)',
    streamingNoFullRam: 'Direct stream without full RAM preloading',

    // Access Verification & Sub-Browser
    verifyAccess: 'Verify Access',
    accessVerification: 'Access Verification',
    subBrowserConnected: 'Connected Sub-Browser',
    sessionValidated: '✓ Session validated on server',
    sessionExpiredOrRejected: 'Session expired or rejected',
    requiresManualVerification: 'Requires manual user verification',
    backToOverview: 'Back to panel',
    panel: 'Panel',
    closeModal: 'Close modal',
    floatingSubWindow: 'Floating Sub-Window',
    integratedViewer: 'Integrated Viewer',
    reloadInternalViewer: 'Reload internal viewer',
    connectedUserAgent: 'Connected User-Agent:',
    userAgentSynced: 'Synced',
    copied: 'Copied',
    copyUa: 'Copy UA',
    injectedInServer: '✓ Injected on server',
    floatingSubBrowserTitle: 'Floating Verification Sub-Browser',
    floatingSubBrowserDesc1: 'Providers such as YouTube, Google or Cloudflare block internal embedding (X-Frame-Options).',
    floatingSubBrowserDesc2: 'The floating sub-browser opens a dedicated companion window. It uses your real User-Agent, shares your legitimate cookies, and allows you to solve the challenge without being blocked.',
    floatingSubWindowActive: 'Floating Sub-Window active',
    floatingSubWindowInstruction: 'Complete the challenge or login, then press the green button below.',
    focusWindow: 'Focus',
    reopenOrFocusWindow: 'Reopen or focus window',
    openFloatingSubBrowserRecommended: 'Open Floating Sub-Browser (Recommended)',
    tryIntegratedViewer: 'Try in integrated viewer',
    youtubeFrameWarning: 'YouTube often rejects connections in embedded frames. If you see a gray screen, use the floating sub-browser.',
    switchToFloating: 'Switch to Floating',
    loadingIntegratedViewer: 'Loading integrated viewer...',
    onceChallengeSolved: 'Once the challenge is solved or logged in with your session, press:',
    validatingSessionWithServer: 'Validating session with server...',
    sessionReadyDownloading: 'Session ready — Downloading',
    completedVerificationValidate: 'I have completed verification / Validate session',
    verifyAgain: 'Verify again',
    providerRequiresCheck: 'The provider requires access verification or anti-bot check.',
    providerRequiresCheckDesc: 'Complete verification in the connected sub-browser. Your real User-Agent will be coherently injected into the session to resolve and download the authentic binary resource.',
    sessionExpiredOrInvalid: 'The verification session has expired or is no longer valid.',
    serverRejectedSession: 'The remote server rejected the session. Please complete verification again.',
    sessionVerifiedSuccess: 'Session verified successfully!',
    binaryResourceValidated: 'Binary resource validated. Preparing download streaming...',
    useSessionUserAgent: 'Use session User-Agent',
    useSessionUserAgentDesc: 'Injects your browser user agent into the download engine headers',
    openVerificationSubBrowser: 'Open verification sub-browser',
    verifyAccessCompleted: 'Verify access / I have completed the challenge',
    validatingBinaryStream: 'Validating binary stream on server...',
    privacyNoticeCookies: 'Cookies and tokens are stored in protected temporary memory and purged upon completion.',
    resourceRequiresVerification: 'This resource requires verification.',
    providerRequestsCheck: 'The provider requests checking access or solving an anti-bot challenge.',
    localDownloadUnavailable: 'Local download not available',
    sessionRequiredInternal: 'The resource requires a session or protection that the device cannot reproduce. Internal download will be used.',
    downloadNotAvailable: 'Download currently not available',
    safeCapacity: 'Safe Capacity',
    highDemand: 'High demand',
    recommendedBadge: 'Recommended',
    genericVideoMode: 'Generic Mode: Video',
    genericImageMode: 'Generic Mode: Image',
    genericMangaMode: 'Generic Mode: Manga',

    // Toast & Operational Feedback
    shareReceived: 'Link received from Share menu',
    contentReceivedVerify: 'Content received. Please verify the link.',
    chapterDownloadSuccess: 'Chapter download completed successfully',
    chapterRequiresRetry: 'Finished. Some chapters require retry (Wait Mode available).',
    noFailedChaptersToRetry: 'No failed chapters to retry',
    startingWaitModeRetry: 'Starting Wait Mode: Retrying slow chapters...',
    recoveryCompletedAllDownloaded: 'Recovery completed! All chapters downloaded.',
    recoveryProgress: 'Recovered chapters. Remaining with errors:',
    noChaptersInManga: 'No chapters available in this manga',
    selectAtLeastOneChapter: 'Select at least one chapter',
    failedToGetChapterImages: 'Could not obtain chapter images',
    singlePdfSuccess: 'Single PDF generated successfully!',
    pdfCompileError: 'Error compiling PDF',
    selectedNoDownloadedPages: 'Selected chapters have no downloaded pages yet',
    generatingSinglePdf: '⚡ Generating 1 Single PDF (pdf-lib ➜ img2pdf)...',
    singlePdfCompleted: 'Single PDF download completed!',
    packagingZipPdfs: 'Packaging ZIP with individual chapter PDFs...',
    zipPdfsSuccess: 'ZIP with chapter PDFs downloaded successfully!',
    zipPdfsError: 'Error generating ZIP file with PDFs',
    cbzExportSuccess: 'CBZ files downloaded successfully!',
    cbzExportError: 'Error exporting CBZ files',
    noChaptersSelected: 'No chapters selected',
    noChaptersWithImages: 'No selected chapters have downloaded pages',
    individualPdfsSuccess: 'Individual PDFs export completed',
    individualPdfsError: 'Error generating individual PDFs',
    noPagesToExport: 'No pages available to export',
    pdfReadyDownload: 'PDF download ready',
    packagingArchive: 'Packaging archive...',
    archiveDownloadComplete: 'Archive download completed',
    archivePackagingError: 'Error packaging archive',
    audioMp3Ready: 'MP3 audio ready',
    mp3DownloadComplete: 'MP3 download completed',
    mp3ExtractionError: 'Error extracting MP3 audio',
    videoMp4Ready: 'MP4 video generated successfully',
    videoMp4DownloadComplete: 'MP4 video downloaded',
    videoSynthesisError: 'Error synthesizing MP4 video',
    videoDownloadComplete: 'Video download completed',
    videoDownloadError: 'Error downloading video',
    mediaExportError: 'Error during media export',
    downloadingPage: 'Downloading page',
    pageDownloaded: 'Page downloaded',
    pageDownloadError: 'Error downloading page',
    pageDownloadFailed: 'Page download failed',
    noActiveVerificationSession: 'No active verification session found.',
    sessionVerifiedPreparing: 'Session verified! Preparing download...',
    sessionExpiredOrInvalidToast: 'Verification session expired or is no longer valid.',
    verifyingMediaStream: 'Verifying secure media stream...',
    resourceRequiresVerificationToast: 'This resource requires verification.',
    couldNotGenerateSecureUrl: 'Could not generate secure download URL. Using internal processing...',
    downloadingDirectlyToDevice: 'Downloading directly to your device...',
    downloadPrepCommunicationError: 'Communication error with download preparer. Using internal processing...',
    localDownloadSent: 'Local download sent to your device',
    startingInternalProcessing: 'Starting internal processing...',
    trackingPaused: 'Tracking paused',
    trackingResumed: 'Tracking resumed',
    trackingStopped: 'Tracking stopped',
    trackingRestarted: 'Restarting tracking',
    taskDeleted: 'Task deleted',
    analyzeAnotherLink: 'Analyze another link',
    playPreview: 'Play Preview',
    previewUnplayable: 'Preview unplayable',
    detectedChaptersItems: 'Detected Chapters / Items',
    closePlayer: 'Close player',
    noThumbnail: 'No thumbnail',
    retryFailedChaptersWaitMode: 'Retry Failed Chapters (Wait Mode)',
    waitModeTitle: 'Wait Mode prevents errors by pausing when the manga server is slow',
    singlePdfButton: '⚡ 1 Single PDF (pdf-lib ➜ img2pdf)',
    zipSelectionPdfs: 'ZIP Selection (PDFs)',
    cbzSelectionIndividual: 'CBZ Selection (Individual)',
    downloadPage: 'Download Page',
    exportManga: 'Export Manga',
    compilingPdfLib: 'Compiling pdf-lib...',
    compilingImg2Pdf: 'Compiling img2pdf...',
    generatingFile: 'Generating File...',
    downloadMp4Hd: 'Download MP4 HD',
    extractMp3: 'Extract MP3',
    authorCopyToast: 'Author',
    linkCopyToast: 'Link',
    textCopied: 'copied to clipboard',
    categoryMangaPill: 'Manga / Comic',
    categoryVideoPill: 'Video / Audio',
    categoryImagePill: 'Image / Gallery',
    imageGalleriesTitle: 'WebP/ZIP Galleries & Images',
    imageGalleriesDesc: 'Extract high-resolution images packaged in ZIP or WebP format.',
    addDirectlyWithoutAnalysis: 'Add directly without previous metadata analysis',
    waitingForServer: 'Waiting for server',
    startingDownloadOf: 'Starting download of',
    chaptersWord: 'chapters',
    requiredChapters: 'required chapters',
    downloadingChaptersWord: 'Downloading',
    sequentialWord: 'Sequential',
    simultaneousWord: 'Simultaneous',
    connectingWaitMode: 'Connecting in Wait Mode...',
    serverDidNotRespond: 'Server did not respond',
    connectionFailed: 'Connection failed',
    retryingWaitModePrefix: 'Retrying',
    inWaitMode: 'in Wait Mode...',
    connectingToServer: 'Connecting to server...',
    downloadedSuccess: 'downloaded successfully',
    pagesWord: 'pages',
    serverFor: 'The server for',
    didNotRespondInTime: 'did not respond in time.',
    creatingSinglePdf: 'Creating 1 Single PDF',
    noSelectedChaptersDownloaded: 'No selected chapter has downloaded pages',
    downloadingIndividualCbz: 'Downloading individual CBZ archives',
    exportingIndividualPdfs: 'Exporting individual PDFs',
    defaultChapterName: 'Chapter',
    verificationSessionExpired: 'The verification session has expired or is no longer valid.',
    communicationErrorVerification: 'Communication error while verifying session.',
    localDownloadUnavailableInternalFallback: 'Local download unavailable. Processing internally...',
    localDirectUnavailableUsingInternal: 'Direct local download unavailable. Using internal processing...',
    serverGuardianShort: 'Server Guardian',
    rangeAndSize: 'Range & Size',
    pagesShort: 'pgs',
    chaptersShort: 'chaps',
    videoPillSubtitle: 'Download complete video and MP3 track for playback or sync',
    galleriesAndImagesWebpZip: 'Galleries & WebP/ZIP Images',
    galleriesAndImagesSubtitle: 'Extract high-resolution images packaged in ZIP or original WebP',
    retryBrokenWaitModeBtn: 'Retry Broken (Wait Mode)',
    selectFirstQty: 'Select first',
    downloadFirstQtyPdfTitle: 'Download and compile first chapters into 1 single PDF (pdf-lib ➜ img2pdf)',
    downloadSinglePdfFirst: 'Download 1 Single PDF (First)',
    selectLastQty: 'Select last',
    downloadLastQtyPdfTitle: 'Download and compile last chapters into 1 single PDF (pdf-lib ➜ img2pdf)',
    downloadSinglePdfLast: 'Download 1 Single PDF (Last)',
    downloadQtyPdfTitle: 'Download and compile into 1 single PDF (pdf-lib ➜ img2pdf)',
    downloadQtyToSinglePdf: 'Download Quantity to 1 Single PDF',
    compileSelectedPdfTitle: 'Compile selected chapters into 1 single PDF document with pdf-lib (backup img2pdf)',
    downloadSelectedZipTitle: 'Download all selected chapters inside a ZIP containing each chapter\'s PDF',
    downloadSelectedCbzTitle: 'Download selected chapters into individual .cbz files for each chapter',
    integratedVerificationViewer: 'Integrated verification viewer',
    addDirectWithoutPreanalysis: 'Add directly without pre-analysis',
    webVideo: 'Web Video',
    webImages: 'Web Images',
    videoConfirmed: 'Category confirmed: Video',
    imageConfirmed: 'Category confirmed: Image',
    mangaConfirmed: 'Category confirmed: Manga',
    selectCategoryBelow: 'Select a category below',
    confirmCategoryBeforeStarting: 'Please confirm category before starting',
    addedCorrectly: 'added successfully',
    unrecognizedDomainPrompt: 'No specialized extractor identified for this domain. Choose the content type you want to attempt to extract:',
    detectedPrefix: 'Detected',
    suggestedCategoryPrefix: 'Suggested category',
    waitModeLabel: 'Wait Mode',
    retryBrokenWaitModePrefix: 'Retry',
    brokenSuffix: 'Broken'
  },
  es: {
    appTitle: 'Liquid Fast Download',
    tagline: 'Motor avanzado de búsqueda, medios continuos y extracción secuencial de datos.',
    enterUrl: 'Introduce la URL a rastrear...',
    modeSingle: 'Capítulo Único',
    modeSequential: 'Capítulos Secuenciales',
    modeContinuous: 'Modo Simultáneo (Continua)',
    startTracking: 'Iniciar Rastreo',
    trackingStatus: 'Estado',
    tracking: 'Rastreando',
    running: 'Descargando',
    completed: 'Completado',
    failed: 'Fallido',
    error: 'Error',
    paused: 'Pausado',
    idle: 'Inactivo',
    stopped: 'Detenido',
    imagesFound: 'Imágenes / Miniaturas',
    images: 'Imágenes',
    exportPdf: 'Exportar PDF',
    exportPdfPdfLib: 'PDF (pdf-lib)',
    exportPdfImg2Pdf: 'PDF (img2pdf)',
    pdfLibDescription: 'Incrustación de flujo binario vectorial',
    img2PdfDescription: 'Empaquetado 1:1 directo imagen-a-PDF',
    previewView: 'Vista Previa',
    fullView: 'Vista Completa',
    generatingPdf: 'Generando PDF...',
    generatingPdfLib: 'Exportando (pdf-lib)...',
    generatingImg2Pdf: 'Exportando (img2pdf)...',
    emptyState: 'No hay rastreadores activos. Usa el botón superior de "Nueva Tarea" para comenzar a extraer.',
    noActiveTasks: 'No hay tareas activas de rastreo',
    loading: 'Cargando...',
    progress: 'Progreso',
    speed: 'Velocidad',
    date: 'Fecha',
    controls: 'Controles',
    newTask: 'Nueva Tarea',
    createNewTask: 'Crear Nueva Tarea',
    createTaskSubtitle: 'Ingresa el enlace y configura el modo de extracción y descarga',
    mangaUrl: 'URL Objetivo',
    videoUrlLabel: 'URL del Video',
    imageUrlLabel: 'URL de la Imagen / Galería',
    trackingMode: 'Modo de Rastreo',
    trackAllSimultaneously: 'Rastrear todos los capítulos simultáneamente',
    trackAllOneAfterAnother: 'Rastrear todos los capítulos uno tras otro',
    trackOnlyOneSpecified: 'Rastrear solo un capítulo específico',
    cancel: 'Cancelar',
    addTask: 'Añadir Tarea',
    restart: 'Reiniciar',
    pause: 'Pausar',
    resume: 'Reanudar',
    stop: 'Detener',
    delete: 'Eliminar',
    pageNumber: 'Página / Frame',
    selectPdfEngine: 'Elegir motor de exportación',
    calculating: 'Calculando...',
    chapters: 'Capítulos / Videos',
    discoveringChapters: 'Descubriendo capítulos...',
    chapter: 'Capítulo',
    downloadingBatch: 'Descargando en paralelo...',
    exportAllPdf: 'Exportar Todo (PDF)',
    exportChapter: 'Exportar PDF',
    pages: 'elementos',
    collapse: 'Plegar',
    expand: 'Desplegar',
    expandAll: 'Expandir Todos',
    collapseAll: 'Plegar Todos',
    pending: 'Pendiente',
    downloading: 'Descargando...',
    customDownload: 'Descarga y Selección Personalizada',
    firstN: 'Primeros',
    lastN: 'Últimos',
    atOnce: 'a la vez',
    downloadSelected: 'Descargar seleccionados',
    exportSelectedPdfLib: 'Exportar Seleccionados (pdf-lib)',
    exportSelectedImg2Pdf: 'Exportar Seleccionados (img2pdf)',
    exportCombinedSinglePdf: '1 Solo PDF (pdf-lib ➜ img2pdf)',
    exportSelectedZipPdfs: 'ZIP Selección (PDFs)',
    exportSelectedCbzIndividual: 'CBZ Selección',
    exportIndividualPdfs: 'Exportar cada cap. en un archivo individual',
    selectAll: 'Seleccionar Todos',
    deselectAll: 'Deselect. Todos',
    invertSelection: 'Invertir',
    selectedCount: 'seleccionados',
    quickPresets: 'Cantidades rápidas',
    enterQuantity: 'Cant.',
    apply: 'Seleccionar',
    checkboxMode: 'Modo Selección con Casillas (Check)',
    allCollapsedNotice: 'Todos los capítulos inician plegados para una carga suave',
    manageSelectionAndDownload: 'Administrar Selección y Descargas',
    closeSelectionPanel: 'Cerrar Gestor',
    openSelectionPanel: 'Selección y Lotes Personalizados',
    batchDownloadDescription: 'Selecciona capítulos con casillas o cantidades rápidas para descargar y exportar en lote o individualmente.',
    searchCategory: 'Categoría',
    categoryManga: 'Manga',
    categoryVideo: 'Video',
    categoryImage: 'Imagen',
    categoryNsfw: 'Imagen',
    categoryMangaDesc: 'Cómics, manhwas, webtoons (único, secuencial, simultáneo) con exportación a PDF',
    categoryVideoDesc: 'YouTube, TikTok, Shorts, clips, playlists con exportación a MP4, MKV, WebM y MP3',
    categoryImageDesc: 'Fotos de TikTok, X / Twitter, Instagram y galerías con exportación a ZIP, CBZ y WebP',
    categoryNsfwDesc: 'Fotos de TikTok, X / Twitter, Instagram y galerías con exportación a ZIP, CBZ y WebP',
    paste: 'Pegar',
    clear: 'Borrar',
    videoSingle: 'Video / Short Único',
    videoSequential: 'Playlist / Secuencial',
    videoParallel: 'Extracción Simultánea / Lote',
    imageSingle: 'Imagen / Publicación Única',
    imageSequential: 'Hilo Secuencial / Galería',
    imageParallel: 'Extracción de Imágenes en Lote',
    nsfwVideoSingle: 'Imagen / Publicación Única',
    nsfwVideoSequential: 'Hilo Secuencial / Galería',
    nsfwVideoParallel: 'Extracción de Imágenes en Lote',
    videoPlayer: 'Reproductor de Video',
    authorBy: 'por',
    author: 'Autor',
    link: 'Enlace',
    copiedToClipboard: 'copiado al portapapeles',
    selectedFirstN: 'Seleccionados los primeros',
    selectedLastN: 'Seleccionados los últimos',
    smartWaitMode: 'Modo Espera Inteligente (Recomendado)',
    antiCrash: 'Anticaídas',
    smartWaitModeDesc: 'Evita que los capítulos queden rotos cuando servidores de manga y medios tardan en responder.',
    serverSlowResponse: 'El servidor tardó en responder al solicitar este capítulo.',
    retryWithWaitModeHint: 'Puedes reintentarlo ahora usando el Modo Espera que hace pausas inteligentes y evita bloqueos.',
    retryChapterWaitMode: 'Reintentar Capítulo (Modo Espera)',
    copyAuthor: 'Copiar nombre del autor',
    copyUrl: 'Copiar URL',

    // Cápsula de idioma y selector
    languageCapsuleTitle: 'Idioma',
    spanish: 'Español',
    english: 'Inglés',
    currentLanguage: 'Idioma actual: Español',
    switchLanguage: 'Cambiar a Inglés',
    languageSwitchedNotification: 'Cambiado a Español',

    // Exportación Categoría Imagen
    exportImageZip: 'Paquete ZIP',
    exportImageCbz: 'Cómic CBZ',
    exportImageWebp: 'Lote WebP',
    exportImageJpg: 'Lote JPG',
    exportImagePng: 'Lote PNG',
    exportSelectedZip: 'Exportar Seleccionados (ZIP)',
    exportSelectedWebp: 'Exportar Seleccionados (WebP)',
    packagingImages: 'Empaquetando imágenes...',
    packagingZip: 'Comprimiendo a ZIP...',
    packagingWebp: 'Convirtiendo a WebP...',

    // Exportación Categoría Video
    exportVideoMp4: 'Video (MP4)',
    exportVideoWebm: 'Video (WebM)',
    exportVideoMkv: 'Video (MKV)',
    exportAudioMp3: 'Audio (MP3)',
    exportSelectedVideo: 'Descargar Video (MP4)',
    exportSelectedAudio: 'Extraer Audio (MP3)',
    exportingVideo: 'Exportando Video...',
    exportingAudio: 'Extrayendo Audio MP3...',
    imageWithAudio: 'Imagen con Audio',
    exportImageAudioVideo: 'Exportar como Video (MP4)',
    exportAudioTrack: 'Exportar Audio (MP3)',
    exportImageOnly: 'Descargar Imagen',
    playAudio: 'Reproducir Audio',
    pauseAudio: 'Pausar Audio',
    synthesizingVideo: 'Generando Video MP4 de Imagen + Audio...',

    // Mejora Arquitectónica: Descubrimiento, Metadatos y Preparación de Descarga
    prepareDownload: 'Preparar descarga',
    analyzingContent: 'Analizando contenido e inspeccionando metadatos...',
    contentFound: 'Contenido encontrado',
    readyToDownload: 'Listo para descargar',
    downloadInternally: 'Descargar internamente',
    downloadLocally: 'Descargar localmente',
    downloadInternallySub: 'Procesamiento y empaquetado en servidor (CBZ, PDF, ZIP, MP4)',
    downloadLocallySub: 'Descarga directa al dispositivo vía navegador / Android',
    serverGuardianTitle: 'Salvavidas de capacidad del servidor',
    recommendedLocalTitle: 'Descarga local recomendada',
    recommendedLocalBanner: 'Este archivo o lote es demasiado grande o la memoria del servidor está en uso. La descarga local protege la estabilidad del servidor.',
    serverSafeNotice: 'Capacidad óptima en el servidor para procesamiento interno.',
    estimatedSizeLabel: 'Tamaño estimado',
    durationLabel: 'Duración',
    resolutionLabel: 'Resolución',
    formatLabel: 'Formato',
    chaptersFoundLabel: 'Capítulos / Ítems encontrados',
    pagesFoundLabel: 'Total páginas / fotogramas',
    batchCalculationTitle: 'Cálculo de lote seleccionado',
    directResourceLink: 'Enlace directo al recurso',
    copyDirectLink: 'Copiar enlace directo',
    streamDownload: 'Transmitir a tu dispositivo',

    // Streaming & Video Preview Resolver
    hideDiagnostics: 'Ocultar Diagnóstico',
    showDiagnostics: 'Ver Diagnóstico de Streaming',
    diagnosticsTitle: 'Diagnóstico Interno del Video Preview Resolver',
    streamingReady: 'Apto para Streaming',
    streamingUnavailable: 'No Disponible',
    streamingModeLabel: 'Modo de Streaming',
    supportsRangeLabel: 'Rango HTTP (206)',
    rangeCompatible: 'Compatible (206) ✅',
    rangeNotDetected: 'No detectado ⚠️',
    contentTypeLabel: 'Tipo de Contenido',
    originHeadersLabel: 'Cabeceras de Origen',
    requiresHeaders: 'Requiere Headers',
    publicStandard: 'Público / Estándar',
    sessionAuthLabel: 'Autenticación',
    requiresSession: 'Requiere Sesión',
    notRequired: 'No requerida',
    streamingHttpRange: 'Streaming HTTP Range (206)',
    streamingNoFullRam: 'Sin precarga completa a RAM',

    // Access Verification & Sub-Browser
    verifyAccess: 'Verificar Acceso',
    accessVerification: 'Verificación de Acceso',
    subBrowserConnected: 'Sub-Navegador Conectado',
    sessionValidated: '✓ Sesión validada en servidor',
    sessionExpiredOrRejected: 'Sesión expirada o rechazada',
    requiresManualVerification: 'Requiere verificación manual del usuario',
    backToOverview: 'Volver al panel',
    panel: 'Panel',
    closeModal: 'Cerrar modal',
    floatingSubWindow: 'Sub-Ventana Flotante',
    integratedViewer: 'Visor Integrado',
    reloadInternalViewer: 'Recargar visor interno',
    connectedUserAgent: 'User-Agent Conectado:',
    userAgentSynced: 'Sincronizado',
    copied: 'Copiado',
    copyUa: 'Copiar UA',
    injectedInServer: '✓ Inyectado en servidor',
    floatingSubBrowserTitle: 'Sub-Navegador Flotante de Verificación',
    floatingSubBrowserDesc1: 'Los proveedores como YouTube, Google o Cloudflare bloquean la incrustación interna (X-Frame-Options).',
    floatingSubBrowserDesc2: 'El sub-navegador flotante abre una ventana dedicada y vinculada a Megiddo Ray. Utiliza tu User-Agent real, comparte tus cookies legítimas y permite resolver el desafío sin ser bloqueado.',
    floatingSubWindowActive: 'Sub-Ventana Flotante activa',
    floatingSubWindowInstruction: 'Completa el reto o login en ella y presiona el botón verde abajo.',
    focusWindow: 'Enfocar',
    reopenOrFocusWindow: 'Volver a abrir o enfocar ventana',
    openFloatingSubBrowserRecommended: 'Abrir Sub-Navegador Flotante (Recomendado)',
    tryIntegratedViewer: 'Probar en visor integrado',
    youtubeFrameWarning: 'YouTube suele rechazar la conexión en marcos internos. Si ves pantalla gris, usa el sub-navegador flotante.',
    switchToFloating: 'Cambiar a Flotante',
    loadingIntegratedViewer: 'Cargando visor integrado...',
    onceChallengeSolved: 'Una vez resuelto el desafío o login con tu sesión, presiona:',
    validatingSessionWithServer: 'Validando sesión con servidor...',
    sessionReadyDownloading: 'Sesión lista — Descargando',
    completedVerificationValidate: 'He completado la verificación / Validar sesión',
    verifyAgain: 'Volver a verificar',
    providerRequiresCheck: 'El proveedor requiere comprobación de acceso o anti-bot.',
    providerRequiresCheckDesc: 'Completa la verificación en el sub-navegador conectado de Megiddo Ray. Se inyectará tu User-Agent real de forma coherente en la sesión para resolver y descargar el recurso binario auténtico.',
    sessionExpiredOrInvalid: 'La sesión de verificación expiró o ya no es válida.',
    serverRejectedSession: 'El servidor remoto rechazó la sesión. Vuelve a completar la verificación.',
    sessionVerifiedSuccess: '¡Sesión verificada exitosamente!',
    binaryResourceValidated: 'Recurso binario validado. Preparando streaming de descarga...',
    useSessionUserAgent: 'Usar User-Agent de la sesión',
    useSessionUserAgentDesc: 'Inyecta tu navegador en las cabeceras del motor de descarga',
    openVerificationSubBrowser: 'Abrir sub-navegador de verificación',
    verifyAccessCompleted: 'Verificar acceso / Ya he completado el reto',
    validatingBinaryStream: 'Validando flujo binario en el servidor...',
    privacyNoticeCookies: 'Cookies y tokens se almacenan en memoria temporal protegida y se purgan al finalizar.',
    resourceRequiresVerification: 'Este recurso requiere una verificación.',
    providerRequestsCheck: 'El proveedor solicita comprobar el acceso o resolver un reto anti-bot.',
    localDownloadUnavailable: 'Descarga local no disponible',
    sessionRequiredInternal: 'El recurso requiere una sesión o protección que el dispositivo no puede reproducir. Se utilizará la descarga interna.',
    downloadNotAvailable: 'Descarga no disponible actualmente',
    safeCapacity: 'Capacidad Segura',
    highDemand: 'Alto consumo',
    recommendedBadge: 'Recomendado',
    genericVideoMode: 'Modo genérico: Vídeo',
    genericImageMode: 'Modo genérico: Imagen',
    genericMangaMode: 'Modo genérico: Manga',

    // Toast & Operational Feedback
    shareReceived: 'Enlace recibido desde el menú Compartir',
    contentReceivedVerify: 'Contenido recibido. Verifica el enlace.',
    chapterDownloadSuccess: 'Descarga de capítulos completada con éxito',
    chapterRequiresRetry: 'Finalizado. Algunos capítulos requieren reintento (Modo Espera disponible).',
    noFailedChaptersToRetry: 'No hay capítulos con error para reintentar',
    startingWaitModeRetry: 'Iniciando Modo Espera: Reintentando capítulos lentos...',
    recoveryCompletedAllDownloaded: '¡Recuperación completada! Todos los capítulos descargados.',
    recoveryProgress: 'Recuperados capítulos. Quedan con error:',
    noChaptersInManga: 'No hay capítulos disponibles en este manga',
    selectAtLeastOneChapter: 'Selecciona al menos un capítulo',
    failedToGetChapterImages: 'No se pudieron obtener imágenes de los capítulos',
    singlePdfSuccess: '¡1 Solo PDF generado con éxito!',
    pdfCompileError: 'Error al compilar el PDF',
    selectedNoDownloadedPages: 'Los capítulos seleccionados no tienen páginas descargadas aún',
    generatingSinglePdf: '⚡ Generando 1 Solo PDF (pdf-lib ➜ img2pdf)...',
    singlePdfCompleted: '¡Descarga de 1 Solo PDF completada!',
    packagingZipPdfs: 'Empaquetando ZIP con PDFs individuales...',
    zipPdfsSuccess: '¡ZIP con PDFs descargado con éxito!',
    zipPdfsError: 'Error al generar archivo ZIP con PDFs',
    cbzExportSuccess: '¡Archivos CBZ descargados con éxito!',
    cbzExportError: 'Error al exportar archivos CBZ',
    noChaptersSelected: 'No hay capítulos seleccionados',
    noChaptersWithImages: 'No hay capítulos seleccionados con páginas descargadas',
    individualPdfsSuccess: 'Exportación de PDFs individuales finalizada',
    individualPdfsError: 'Error al generar PDFs individuales',
    noPagesToExport: 'No hay páginas disponibles para exportar',
    pdfReadyDownload: 'Descarga de PDF lista',
    packagingArchive: 'Empaquetando archivo...',
    archiveDownloadComplete: 'Descarga completada',
    archivePackagingError: 'Error al empaquetar archivo',
    audioMp3Ready: 'Audio MP3 listo',
    mp3DownloadComplete: 'Descarga de MP3 completada',
    mp3ExtractionError: 'Error al extraer audio MP3',
    videoMp4Ready: 'Video MP4 generado con éxito',
    videoMp4DownloadComplete: 'Video MP4 descargado',
    videoSynthesisError: 'Error al sintetizar video MP4',
    videoDownloadComplete: 'Descarga de video completada',
    videoDownloadError: 'Error al descargar video',
    mediaExportError: 'Error durante la exportación de medios',
    downloadingPage: 'Descargando página',
    pageDownloaded: 'Página descargada',
    pageDownloadError: 'Error al descargar página',
    pageDownloadFailed: 'Fallo en la descarga de la página',
    noActiveVerificationSession: 'No se encontró una sesión activa de verificación.',
    sessionVerifiedPreparing: '¡Sesión verificada! Preparando descarga...',
    sessionExpiredOrInvalidToast: 'La sesión de verificación expiró o ya no es válida.',
    verifyingMediaStream: 'Verificando flujo multimedia seguro...',
    resourceRequiresVerificationToast: 'Este recurso requiere una verificación.',
    couldNotGenerateSecureUrl: 'No se pudo generar la URL de descarga segura. Usando procesamiento interno...',
    downloadingDirectlyToDevice: 'Descargando directamente a tu dispositivo...',
    downloadPrepCommunicationError: 'Error de comunicación con el preparador de descarga. Usando procesamiento interno...',
    localDownloadSent: 'Descarga local enviada a tu dispositivo',
    startingInternalProcessing: 'Iniciando procesamiento interno...',
    trackingPaused: 'Rastreo pausado',
    trackingResumed: 'Rastreo reanudado',
    trackingStopped: 'Rastreo detenido',
    trackingRestarted: 'Reiniciando rastreo',
    taskDeleted: 'Tarea eliminada',
    analyzeAnotherLink: 'Analizar otro enlace',
    playPreview: 'Reproducir Preview',
    previewUnplayable: 'Preview no reproducible',
    detectedChaptersItems: 'Capítulos / Ítems detectados',
    closePlayer: 'Cerrar reproductor',
    noThumbnail: 'Sin miniatura',
    retryFailedChaptersWaitMode: 'Reintentar Capítulos Rotos (Modo Espera)',
    waitModeTitle: 'El Modo Espera previene errores reintentando con pausas cuando el servidor del manga está lento',
    singlePdfButton: '⚡ 1 Solo PDF (pdf-lib ➜ img2pdf)',
    zipSelectionPdfs: 'ZIP-Selección (PDFs)',
    cbzSelectionIndividual: 'CBZ-Selección (Individual)',
    downloadPage: 'Descargar Página',
    exportManga: 'Exportar Manga',
    compilingPdfLib: 'Compilando pdf-lib...',
    compilingImg2Pdf: 'Compilando img2pdf...',
    generatingFile: 'Generando Archivo...',
    downloadMp4Hd: 'Descargar MP4 HD',
    extractMp3: 'Extraer MP3',
    authorCopyToast: 'Autor',
    linkCopyToast: 'Enlace',
    textCopied: 'copiado al portapapeles',
    categoryMangaPill: 'Manga / Cómic',
    categoryVideoPill: 'Video / Audio',
    categoryImagePill: 'Imagen / Galería',
    imageGalleriesTitle: 'Galerías e Imágenes WebP/ZIP',
    imageGalleriesDesc: 'Extrae imágenes de alta resolución en empaquetado ZIP o formato WebP.',
    addDirectlyWithoutAnalysis: 'Añadir directamente sin análisis previo de metadatos',
    waitingForServer: 'Esperando servidor',
    startingDownloadOf: 'Iniciando descarga de',
    chaptersWord: 'capítulos',
    requiredChapters: 'capítulos requeridos',
    downloadingChaptersWord: 'Descargando',
    sequentialWord: 'Secuencial',
    simultaneousWord: 'Simultáneo',
    connectingWaitMode: 'Conectando en Modo Espera...',
    serverDidNotRespond: 'Servidor no respondió',
    connectionFailed: 'Fallo de conexión',
    retryingWaitModePrefix: 'Reintentando',
    inWaitMode: 'en Modo Espera...',
    connectingToServer: 'Conectando con el servidor...',
    downloadedSuccess: 'descargado con éxito',
    pagesWord: 'páginas',
    serverFor: 'El servidor de',
    didNotRespondInTime: 'no respondió a tiempo.',
    creatingSinglePdf: 'Creando 1 Solo PDF',
    noSelectedChaptersDownloaded: 'Ningún capítulo seleccionado tiene páginas descargadas',
    downloadingIndividualCbz: 'Descargando archivos CBZ individuales',
    exportingIndividualPdfs: 'Exportando PDFs individuales',
    defaultChapterName: 'Capítulo',
    verificationSessionExpired: 'La sesión de verificación expiró o ya no es válida.',
    communicationErrorVerification: 'Error de comunicación al verificar la sesión.',
    localDownloadUnavailableInternalFallback: 'Descarga local no disponible. Procesando internamente...',
    localDirectUnavailableUsingInternal: 'Descarga local directa no disponible. Usando procesamiento interno...',
    serverGuardianShort: 'Salvavidas Servidor',
    rangeAndSize: 'Rango & Tamaño',
    pagesShort: 'págs',
    chaptersShort: 'caps',
    videoPillSubtitle: 'Descarga video completo y pista MP3 para reproducir o sincronizar',
    galleriesAndImagesWebpZip: 'Galerías e Imágenes WebP/ZIP',
    galleriesAndImagesSubtitle: 'Extrae imágenes de alta resolución en empaquetado ZIP o WebP original',
    retryBrokenWaitModeBtn: 'Reintentar Rotos (Modo Espera)',
    selectFirstQty: 'Seleccionar primeros',
    downloadFirstQtyPdfTitle: 'Descargar y compilar los primeros capítulos en 1 solo PDF (pdf-lib ➜ img2pdf)',
    downloadSinglePdfFirst: 'Descargar 1 Solo PDF (Primeros)',
    selectLastQty: 'Seleccionar últimos',
    downloadLastQtyPdfTitle: 'Descargar y compilar los últimos capítulos en 1 solo PDF (pdf-lib ➜ img2pdf)',
    downloadSinglePdfLast: 'Descargar 1 Solo PDF (Últimos)',
    downloadQtyPdfTitle: 'Descargar y compilar en 1 solo PDF (pdf-lib ➜ img2pdf)',
    downloadQtyToSinglePdf: 'Descargar Cantidad a 1 Solo PDF',
    compileSelectedPdfTitle: 'Compilar capítulos seleccionados en 1 solo documento PDF con pdf-lib (respaldo img2pdf)',
    downloadSelectedZipTitle: 'Descargar todos los capítulos seleccionados dentro de un ZIP con los PDFs de cada capítulo',
    downloadSelectedCbzTitle: 'Descargar los capítulos seleccionados en archivos .cbz individuales para cada capítulo',
    integratedVerificationViewer: 'Visor integrado de verificación',
    addDirectWithoutPreanalysis: 'Añadir directo sin preanálisis',
    webVideo: 'Vídeo Web',
    webImages: 'Imágenes Web',
    videoConfirmed: 'Categoría confirmada: Video',
    imageConfirmed: 'Categoría confirmada: Imagen',
    mangaConfirmed: 'Categoría confirmada: Manga',
    selectCategoryBelow: 'Selecciona una categoría abajo',
    confirmCategoryBeforeStarting: 'Por favor confirma la categoría antes de iniciar',
    addedCorrectly: 'añadido correctamente',
    unrecognizedDomainPrompt: 'No se identificó un extractor especializado para este dominio. Elige el tipo de contenido que deseas intentar extraer:',
    detectedPrefix: 'Detectamos',
    suggestedCategoryPrefix: 'Categoría sugerida',
    waitModeLabel: 'Modo Espera',
    retryBrokenWaitModePrefix: 'Reintentar',
    brokenSuffix: 'Rotos'
  }
} as const;

export type TranslationKey = keyof typeof translations['en'];

type I18nContextType = {
  t: (key: TranslationKey) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'liquid_preferred_lang';

/**
 * High-accuracy multi-tier browser and system language detection.
 * Prioritizes:
 * 1. User manual localStorage setting.
 * 2. navigator.languages ordered preference list.
 * 3. navigator.language.
 * 4. Fallback system properties.
 */
export function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'es';
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') {
      return saved;
    }
  } catch {
    // Ignore storage issues in private browsing
  }

  if (typeof navigator === 'undefined') {
    return 'es';
  }

  const candidateLanguages: string[] = [];

  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    candidateLanguages.push(...navigator.languages);
  }
  if (navigator.language) {
    candidateLanguages.push(navigator.language);
  }
  const userLang = (navigator as unknown as { userLanguage?: string; browserLanguage?: string }).userLanguage;
  if (userLang) {
    candidateLanguages.push(userLang);
  }
  const browserLang = (navigator as unknown as { browserLanguage?: string }).browserLanguage;
  if (browserLang) {
    candidateLanguages.push(browserLang);
  }

  for (const lang of candidateLanguages) {
    if (typeof lang === 'string') {
      const lower = lang.toLowerCase().trim();
      if (lower.startsWith('es') || lower.includes('spanish') || lower.includes('es-')) {
        return 'es';
      }
      if (lower.startsWith('en') || lower.includes('english') || lower.includes('en-')) {
        return 'en';
      }
    }
  }

  return 'es';
}

const languageListeners = new Set<() => void>();

function subscribeLanguage(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  languageListeners.add(callback);
  
  const handleNativeLangChange = () => {
    // If no manual preference is saved, update automatically on browser change
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        callback();
      }
    } catch {
      callback();
    }
  };

  window.addEventListener('languagechange', handleNativeLangChange);
  return () => {
    languageListeners.delete(callback);
    window.removeEventListener('languagechange', handleNativeLangChange);
  };
}

let cachedLang: Language | null = null;

function getLanguageSnapshot(): Language {
  if (cachedLang !== null) return cachedLang;
  cachedLang = detectBrowserLanguage();
  return cachedLang;
}

function getServerLanguageSnapshot(): Language {
  return 'es';
}

function updateLanguage(newLang: Language) {
  cachedLang = newLang;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
    }
  } catch (e) {
    console.warn('Could not save language preference:', e);
  }
  languageListeners.forEach(fn => fn());
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const currentLang = useSyncExternalStore(
    subscribeLanguage,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
  }, [currentLang]);

  const handleSetLanguage = useCallback((lang: Language) => {
    updateLanguage(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    const nextLang = currentLang === 'es' ? 'en' : 'es';
    updateLanguage(nextLang);
  }, [currentLang]);

  const t = useCallback((key: TranslationKey): string => {
    const langObj = translations[currentLang] as Record<TranslationKey, string>;
    const defaultObj = translations.es as Record<TranslationKey, string>;
    return langObj?.[key] || defaultObj?.[key] || translations.en[key] || String(key);
  }, [currentLang]);

  return (
    <I18nContext.Provider value={{ t, language: currentLang, setLanguage: handleSetLanguage, toggleLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
