import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestHandler } from 'http-proxy-middleware';

// OnlyOffice Document Server가 브라우저에 내려주는 스크립트(api.js)/정적 자산/편집기 iframe이
// 전부 이 백엔드와 같은 오리진(같은 ngrok 도메인)에서 오는 것처럼 보이게 그대로 중계한다 —
// 덕분에 OnlyOffice용 터널을 따로 열 필요가 없다. /api, /collab로 시작하는 요청은 우리 앱이
// 직접 처리해야 하므로 건드리지 않는다(pathFilter가 false를 반환하면 다음 미들웨어로 넘어감).
export function createOnlyofficeProxyMiddleware(target: string): RequestHandler {
  return createProxyMiddleware({
    target,
    // changeOrigin:true였다가 실제로 버그를 만난 부분 — OnlyOffice는 요청의 Host 헤더를 보고
    // "내가 지금 어느 주소로 보이는지"를 판단해서 캐시 파일 등 일부 리소스의 절대 URL을
    // 스스로 만들어 응답에 넣는다. Host를 target(localhost:8080)으로 바꿔버리면 그 절대
    // URL도 localhost:8080으로 나가는데, 브라우저 입장에선 페이지 오리진(백엔드/ngrok 도메인)과
    // 달라서 CORS에 막혀 net::ERR_FAILED가 난다 — false로 둬서 원래 Host(공개 주소)가 그대로
    // 전달되게 해야 OnlyOffice가 자기 자신을 "우리와 같은 오리진"으로 알고 URL을 만든다.
    changeOrigin: false,
    ws: true,
    pathFilter: (path) => !path.startsWith('/api') && path !== '/collab',
  });
}
