/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_BACKEND_URL?: string;
  // 웹 푸시 공개키(VAPID). 없으면 브라우저를 닫았을 때의 알림은 꺼진 채로 동작한다.
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
