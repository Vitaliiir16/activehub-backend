// ActiveHub email templates: one plain-text and HTML layout for every notification category.
export type EmailContent = {
  title: string;
  body: string;
  link: string;
  category: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const optional = new Set(["REMINDERS", "PROMOTIONS", "LOYALTY", "MESSAGES"]);

export function publicBaseUrl(env: Record<string, string | undefined> = process.env) {
  const candidate =
    env.APP_PUBLIC_URL?.trim() ||
    env.APP_ORIGINS?.split(",")[0]?.trim() ||
    env.APP_ORIGIN?.trim() ||
    "http://localhost:8080";
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("scheme");
    return url.origin;
  } catch {
    throw new Error("Invalid APP_PUBLIC_URL configuration");
  }
}

export function absoluteLink(base: string, link: string) {
  return /^\/(?!\/)/.test(link) ? `${base}${link}` : base;
}

export function renderEmail(content: EmailContent, base = publicBaseUrl()) {
  const url = absoluteLink(base, content.link);
  const preferences = `${base}/profile`;
  const footer = optional.has(content.category)
    ? `You receive this email because of your notification settings. Change them any time: ${preferences}`
    : "This is a service message about your ActiveHub account or bookings.";
  const text = `${content.title}\n\n${content.body}\n\nOpen in ActiveHub: ${url}\n\n--\nActiveHub\n${footer}\n`;
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1b2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0f766e;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold">ActiveHub</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(content.title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;white-space:pre-line">${escapeHtml(content.body)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px">Open in ActiveHub</a></p>
<p style="margin:0;font-size:12px;color:#5b6675;word-break:break-all">${escapeHtml(url)}</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f4f6f8;font-size:12px;color:#5b6675;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
