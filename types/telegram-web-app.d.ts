export {};

declare global {
  interface TelegramWebAppUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  }

  interface TelegramWebAppSafeAreaInset {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }

  interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
      user?: TelegramWebAppUser;
      start_param?: string;
      [key: string]: unknown;
    };
    version?: string;
    platform?: string;
    colorScheme: "light" | "dark";
    themeParams: Record<string, string>;
    isExpanded?: boolean;
    viewportHeight?: number;
    viewportStableHeight?: number;
    isFullscreen?: boolean;
    safeAreaInset?: TelegramWebAppSafeAreaInset;
    contentSafeAreaInset?: TelegramWebAppSafeAreaInset;
    ready: () => void;
    expand: () => void;
    close: () => void;
    requestFullscreen?: () => void;
    exitFullscreen?: () => void;
    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;
    isVersionAtLeast?: (version: string) => boolean;
    onEvent: (eventType: string, callback: () => void) => void;
    offEvent: (eventType: string, callback: () => void) => void;
  }

  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}