import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendInviteEmail({
  to,
  registerUrl,
  invitedBy,
}: {
  to: string;
  registerUrl: string;
  invitedBy?: string;
}) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[email] GMAIL credentials not set — skipping email send");
    return { sent: false, reason: "no_credentials" };
  }

  try {
    const info = await transporter.sendMail({
      from: `CohortIQ <${process.env.GMAIL_USER}>`,
      to,
      subject: "You're invited to CohortIQ",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,0.07)">
    <div style="background:#141209;padding:28px 32px;text-align:center">
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">
        Cohort<span style="color:#b8923a">IQ</span>
      </h1>
      <p style="margin:6px 0 0;font-size:12px;color:#7d7768;letter-spacing:1px;text-transform:uppercase">Study Smarter Together</p>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#141209">You're invited!</h2>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3a3626">
        ${invitedBy ? `<strong>${invitedBy}</strong> has invited you` : "You've been invited"} to join CohortIQ — the AI-powered study platform built for your cohort.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#7d7768">What you'll get access to:</p>
      <ul style="margin:0 0 24px;padding-left:18px;font-size:13px;line-height:1.8;color:#3a3626">
        <li>AI Chat Tutor with your course materials</li>
        <li>Smart Flashcards with spaced repetition</li>
        <li>Practice Quizzes that adapt to your gaps</li>
        <li>AI Podcasts, Videos, Mind Maps & more</li>
      </ul>
      <div style="text-align:center;margin:28px 0">
        <a href="${registerUrl}" style="display:inline-block;background:#b8923a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.3px">
          Create Your Account
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;color:#7d7768;text-align:center">
        Or copy this link into your browser:
      </p>
      <p style="margin:0;font-size:11px;color:#b8923a;word-break:break-all;text-align:center">
        ${registerUrl}
      </p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid rgba(0,0,0,0.07);text-align:center">
      <p style="margin:0;font-size:11px;color:#c4bfb0">
        This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>`,
    });

    return { sent: true, id: info.messageId };
  } catch (err: any) {
    console.error("[email] Send failed:", err.message);
    return { sent: false, reason: err.message };
  }
}
