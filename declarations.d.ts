declare module 'yt-search' {
  interface VideoSearchResult {
    type: 'video';
    videoId: string;
    url: string;
    title: string;
    description: string;
    image: string;
    thumbnail: string;
    seconds: number;
    timestamp: string;
    duration: {
      toString(): string;
      seconds: number;
      timestamp: string;
    };
    ago: string;
    views: number;
    author: {
      name: string;
      url: string;
    };
  }

  interface SearchResult {
    all: any[];
    videos: VideoSearchResult[];
    live: any[];
    playlists: any[];
    channels: any[];
    accounts: any[];
  }

  type SearchCallback = (err: Error | null | undefined, result: SearchResult) => void;

  function search(query: string | { query: string; pageStart?: number; pageEnd?: number }): Promise<SearchResult>;
  function search(query: string | { query: string }, callback: SearchCallback): void;

  export default search;
}
