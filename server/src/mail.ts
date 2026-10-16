import { Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

// 메일 보내기(가입 확인·비밀번호 재설정). 운영은 SMTP, 개발은 서버 로그에 링크를 찍는다.
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string; // 있으면 글자판(text)과 함께 보낸다 — 글자만 있는 자동 메일보다 스팸으로 덜 분류된다
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
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
  }
}

// 개발용: 실제로 보내지 않고 받는 사람·제목·본문(링크 포함)을 로그에 남긴다. 운영에서는 쓸 수 없다(config가 막음).
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger("Mail");

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[개발용 메일] 받는 사람 ${message.to} · ${message.subject}\n${message.text}`);
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 메일 한 통의 틀: 인사 → 안내 → 버튼(링크) → 버튼이 안 될 때 붙여 넣을 주소 → 무시 안내 → 서명.
// 글자판(text)과 HTML판을 같은 내용으로 만든다(글자만 있거나 주소만 덩그러니 있는 메일은 스팸으로 분류되기 쉽다).
function letter(subject: string, lines: string[], action: { label: string; url: string }, footer: string): Omit<MailMessage, "to"> {
  const text = ["안녕하세요, Slackerspace입니다.", "", ...lines, "", action.url, "", footer, "", "Slackerspace 드림"].join("\n");
  const paragraph = (line: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1f2937">${escapeHtml(line)}</p>`;
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#111827">Slackerspace</p>
${paragraph("안녕하세요, Slackerspace입니다.")}
${lines.map(paragraph).join("\n")}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6b7280">버튼이 눌리지 않으면 아래 주소를 브라우저에 붙여 넣어 주세요.<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280">${escapeHtml(footer)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

// 메일 문구. 링크는 화면(프론트) 주소로 가고, 화면이 토큰을 서버 API로 넘긴다.
export const mailTemplates = {
  confirm: (appUrl: string, token: string): Omit<MailMessage, "to"> => letter(
    "Slackerspace 이메일 인증을 완료해 주세요",
    ["Slackerspace에 가입해 주셔서 감사합니다.", "아래 버튼을 눌러 이메일 인증을 완료하면 로그인할 수 있습니다. 링크는 24시간 동안 유효합니다."],
    { label: "이메일 인증하기", url: `${appUrl}/confirm-email?token=${token}` },
    "직접 가입하지 않았다면 이 메일은 무시해 주세요.",
  ),
  // 이미 가입된 이메일로 다시 가입을 시도했을 때: 화면에는 똑같이 "메일을 보냈다"고만 하고, 여기서 재설정 방법을 알린다.
  alreadyRegistered: (appUrl: string, token: string): Omit<MailMessage, "to"> => letter(
    "Slackerspace 이미 가입된 이메일입니다",
    ["이 이메일로 가입이 시도되었지만, 이미 가입된 계정이 있습니다.", "비밀번호를 잊었다면 아래 버튼에서 새 비밀번호를 정할 수 있습니다. 링크는 1시간 동안 유효합니다."],
    { label: "비밀번호 새로 정하기", url: `${appUrl}/reset-password?token=${token}` },
    "직접 시도하지 않았다면 이 메일은 무시해 주세요. 계정은 그대로입니다.",
  ),
  reset: (appUrl: string, token: string): Omit<MailMessage, "to"> => letter(
    "Slackerspace 비밀번호 재설정",
    ["비밀번호 재설정을 요청하셨습니다.", "아래 버튼에서 새 비밀번호를 정할 수 있습니다. 링크는 1시간 동안, 한 번만 사용할 수 있습니다."],
    { label: "비밀번호 재설정하기", url: `${appUrl}/reset-password?token=${token}` },
    "직접 요청하지 않았다면 이 메일은 무시해 주세요. 비밀번호는 바뀌지 않습니다.",
  ),
};
