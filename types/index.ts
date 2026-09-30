export type TrackingMode = 'single' | 'sequential' | 'continuous';
export type TrackingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'stopped';
export type SearchCategory = 'manga' | 'video' | 'image' | 'nsfw';

export interface ChapterInfo {
  id: string | number;
  name: string;
  url: string;
  imageCount?: number;
  images?: string[];
  status?: 'pending' | 'downloading' | 'completed' | 'error';
  mediaType?: 'image' | 'video' | 'image_with_audio' | 'audio';
  videoUrl?: string;
  audioUrl?: string;
  videoEmbedUrl?: string;
  hasAudio?: boolean;
  author?: string;
  authorUrl?: string;
  retryAttempt?: number;
  errorMsg?: string;
}

export interface Tracker {
  id: string;
  url: string;
  title?: string;
  category?: SearchCategory;
  mode: TrackingMode;
  status: TrackingStatus;
  progress: number; // 0-100
  downloadSpeed: string;
  imageCount: number;
  totalImages?: number;
  images: string[];
  dateAdded: string;
  totalChapters?: number;
  completedChapters?: number;
  currentChapter?: string;
  chapters?: ChapterInfo[];
  mediaType?: 'image' | 'video' | 'image_with_audio' | 'audio';
  videoUrl?: string;
  audioUrl?: string;
  videoEmbedUrl?: string;
  hasAudio?: boolean;
  author?: string;
  authorUrl?: string;
  slowServerMode?: boolean;
}

export interface NewTrackerRequest {
  url: string;
  category?: SearchCategory;
  mode: TrackingMode;
  slowServerMode?: boolean;
}
