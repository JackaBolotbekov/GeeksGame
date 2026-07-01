interface TelegramWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
  Telegram?: {
    WebApp: TelegramWebApp;
  };
  YT?: {
    Player: new (
      element: HTMLElement,
      options: {
        videoId?: string;
        width?: string;
        height?: string;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: () => void;
          onStateChange?: (event: { data: number }) => void;
        };
      },
    ) => {
      playVideo(): void;
      pauseVideo(): void;
      cueVideoById(videoId: string): void;
      loadVideoById(videoId: string): void;
      destroy(): void;
    };
    PlayerState: {
      ENDED: number;
      PLAYING: number;
      PAUSED: number;
    };
  };
  onYouTubeIframeAPIReady?: () => void;
}
