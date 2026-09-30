export type AlertType =
  | 'url_invalid'
  | 'url_unsupported'
  | 'unknown_platform'
  | 'unknown_category'
  | 'extractor_unavailable'
  | 'extraction_failed'
  | 'content_deleted'
  | 'content_private'
  | 'special_handling'
  | 'server_temporary_error'
  | 'info';

export type AlertLevel = 'stable' | 'warning' | 'critical';

export interface AlertItem {
  id: string;
  timestamp: string;
  type: AlertType;
  level: AlertLevel;
  title: string;
  titleEn?: string;
  userMessage: string;
  userMessageEn?: string;
  technicalDetails?: string;
  technicalDetailsEn?: string;
  url?: string;
  dismissed?: boolean;
}

export const ALERT_TYPE_LABELS: Record<AlertType, { es: string; en: string }> = {
  url_invalid: {
    es: 'URL Inválida',
    en: 'Invalid URL',
  },
  url_unsupported: {
    es: 'URL No Soportada',
    en: 'Unsupported URL',
  },
  unknown_platform: {
    es: 'Plataforma Desconocida',
    en: 'Unknown Platform',
  },
  unknown_category: {
    es: 'Categoría Desconocida',
    en: 'Unknown Category',
  },
  extractor_unavailable: {
    es: 'Extractor No Disponible',
    en: 'Extractor Unavailable',
  },
  extraction_failed: {
    es: 'Extracción Fallida',
    en: 'Extraction Failed',
  },
  content_deleted: {
    es: 'Contenido Eliminado',
    en: 'Content Deleted',
  },
  content_private: {
    es: 'Contenido Privado',
    en: 'Private Content',
  },
  special_handling: {
    es: 'Tratamiento Especial Requerido',
    en: 'Special Handling Required',
  },
  server_temporary_error: {
    es: 'Error Temporal de Servidor',
    en: 'Temporary Server Error',
  },
  info: {
    es: 'Información del Sistema',
    en: 'System Info',
  },
};
