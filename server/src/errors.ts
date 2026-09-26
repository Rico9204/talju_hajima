import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

// 응답은 항상 { message } 한 줄. DB 함수가 raise 한 한국어 안내(예: "팀장 또는 부팀장만…")는
// 그대로 전달해 화면이 Supabase 때와 같은 문구를 보여 주게 하고, 그 밖의 DB 오류 내용은 숨긴다.
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiError");

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const message = typeof body === "string" ? body : (body as { message?: string | string[] }).message;
      response.status(error.getStatus()).json({ message: Array.isArray(message) ? message.join(", ") : message ?? error.message });
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
