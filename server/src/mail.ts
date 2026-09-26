import { Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

// 메일 보내기(가입 확인·비밀번호 재설정). 운영은 SMTP, 개발은 서버 로그에 링크를 찍는다.
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;

  constructor(smtpUrl: string, private readonly from: string) {
    super();
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
  }
}

// 개발용: 실제로 보내지 않고 받는 사람·제목·본문(링크 포함)을 로그에 남긴다. 운영에서는 쓸 수 없다(config가 막음).
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger("Mail");

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[개발용 메일] 받는 사람 ${message.to} · ${message.subject}\n${message.text}`);
  }
}

// 메일 문구. 링크는 화면(프론트) 주소로 가고, 화면이 토큰을 서버 API로 넘긴다.
export const mailTemplates = {
  confirm: (appUrl: string, token: string): Omit<MailMessage, "to"> => ({
    subject: "[CollabPeer] 이메일 인증을 완료해 주세요",
    text: [
      "CollabPeer 가입을 환영합니다.",
      "아래 링크를 눌러 이메일 인증을 완료하면 로그인할 수 있습니다(24시간 동안 유효).",
      "",
      `${appUrl}/confirm-email?token=${token}`,
      "",
      "직접 가입하지 않았다면 이 메일은 무시해 주세요.",
    ].join("\n"),
  }),
  // 이미 가입된 이메일로 다시 가입을 시도했을 때: 화면에는 똑같이 "메일을 보냈다"고만 하고, 여기서 재설정 방법을 알린다.
  alreadyRegistered: (appUrl: string, token: string): Omit<MailMessage, "to"> => ({
    subject: "[CollabPeer] 이미 가입된 이메일입니다",
    text: [
      "이 이메일로 가입이 시도되었지만, 이미 가입된 계정이 있습니다.",
      "비밀번호를 잊었다면 아래 링크에서 새 비밀번호를 정할 수 있습니다(1시간 동안 유효).",
      "",
      `${appUrl}/reset-password?token=${token}`,
      "",
      "직접 시도하지 않았다면 이 메일은 무시해 주세요. 계정은 그대로입니다.",
    ].join("\n"),
  }),
  reset: (appUrl: string, token: string): Omit<MailMessage, "to"> => ({
    subject: "[CollabPeer] 비밀번호 재설정",
    text: [
      "아래 링크에서 새 비밀번호를 정할 수 있습니다(1시간 동안 유효, 한 번만 사용 가능).",
      "",
      `${appUrl}/reset-password?token=${token}`,
      "",
      "직접 요청하지 않았다면 이 메일은 무시해 주세요. 비밀번호는 바뀌지 않습니다.",
    ].join("\n"),
  }),
};
