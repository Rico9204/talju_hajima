import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

// 프레임워크가 만든 영어 기본 문구(없는 주소 "Cannot GET …", 깨진 JSON, ParseIntPipe의 "Validation failed …" 등)를
// 상태 코드별 한국어로 바꾼다. 우리 코드가 던지는 안내는 모두 한국어라 한글이 들어 있으면 그대로 둔다.
const KOREAN_BY_STATUS: Record<number, string> = {
  400: "요청 형식이 올바르지 않습니다.",
  401: "로그인이 필요합니다.",
  403: "권한이 없습니다.",
  404: "요청한 주소를 찾을 수 없습니다.",
  413: "보낸 내용이 너무 큽니다.",
  429: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};
const hasHangul = (text: string) => /[가-힣]/.test(text);

// 응답은 항상 { message } 한 줄. DB 함수가 raise 한 한국어 안내(예: "팀장 또는 부팀장만…")는
// 그대로 전달해 화면이 Supabase 때와 같은 문구를 보여 주게 하고, 그 밖의 DB 오류 내용은 숨긴다.
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiError");

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const raw = typeof body === "string" ? body : (body as { message?: string | string[] }).message;
      const status = error.getStatus();
      const message = (Array.isArray(raw) ? raw.join(", ") : raw) ?? error.message;
      response.status(status).json({ message: hasHangul(message) ? message : KOREAN_BY_STATUS[status] ?? "요청을 처리할 수 없습니다." });
      return;
    }
    // 요청 본문 해석 단계(body-parser)의 오류: 너무 큰 요청(413) 등. HttpException이 아니라 status·expose만 달려 온다.
    const clientStatus = (error as { status?: unknown; expose?: unknown })?.status;
    if (typeof clientStatus === "number" && clientStatus >= 400 && clientStatus < 500 && (error as { expose?: unknown }).expose === true) {
      response.status(clientStatus).json({ message: KOREAN_BY_STATUS[clientStatus] ?? "요청을 처리할 수 없습니다." });
      return;
    }
    const code = (error as { code?: string })?.code ?? "";
    if (code === "P0001") {
      response.status(400).json({ message: (error as Error).message });
    } else if (code === "42501") {
      // 권한 규칙(RLS)·권한 회수에 걸린 경우
      response.status(403).json({ message: "권한이 없습니다." });
    } else if (code.startsWith("23") || code === "22P02") {
      // 제약 조건 위반·잘못된 형식(예: 없는 폴더 번호)
      response.status(400).json({ message: "요청을 처리할 수 없습니다." });
    } else {
      this.logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
      response.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  }
}
