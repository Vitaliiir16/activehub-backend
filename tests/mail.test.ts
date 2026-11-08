import assert from "node:assert/strict";
import test from "node:test";
import { renderEmail, publicBaseUrl, absoluteLink } from "../src/infrastructure/email-templates";
import { classifyError, describeSmtp, smtpSettings } from "../src/infrastructure/mail";

test("default SMTP settings capture mail locally without authentication or TLS", () => {
  const s = smtpSettings({});
  assert.equal(s.host, "mailpit");
  assert.equal(s.port, 1025);
  assert.equal(s.external, false);
  assert.equal(s.ignoreTls, true);
  assert.equal(s.requireTls, false);
  assert.equal(s.user, undefined);
  assert.equal(describeSmtp(s), "local capture mailpit:1025");
  assert.equal(smtpSettings({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_USER: "", SMTP_PASSWORD: "" }).external, false);
});

test("Gmail STARTTLS settings are authenticated, encrypted and sent from the account", () => {
  const s = smtpSettings({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USER: "Member@Gmail.com",
    SMTP_PASSWORD: "abcd efgh ijkl mnop",
  });
  assert.equal(s.external, true);
  assert.equal(s.secure, false);
  assert.equal(s.requireTls, true);
  assert.equal(s.ignoreTls, false);
  assert.equal(s.rejectUnauthorized, true);
  assert.equal(s.fromAddress, "member@gmail.com");
  assert.equal(s.fromName, "ActiveHub");
  assert.equal(describeSmtp(s), "smtp.gmail.com:587 (STARTTLS, authenticated)");
  assert.ok(!describeSmtp(s).includes("abcd"));
});

test("port 465 uses implicit TLS and a custom sender name is sanitized", () => {
  const s = smtpSettings({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "member@gmail.com",
    SMTP_PASSWORD: "secret",
    SMTP_FROM_NAME: 'Active"Hub\r\nBcc: x',
  });
  assert.equal(s.secure, true);
  assert.equal(s.requireTls, false);
  assert.ok(!/[\r\n"<>]/.test(s.fromName));
  assert.equal(smtpSettings({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "2465", SMTP_SECURE: "true" }).secure, true);
});

test("invalid SMTP settings are rejected before the worker starts", () => {
  assert.throws(() => smtpSettings({ SMTP_USER: "a@b.co" }), /both SMTP_USER and SMTP_PASSWORD/);
  assert.throws(() => smtpSettings({ SMTP_PASSWORD: "x" }), /both SMTP_USER and SMTP_PASSWORD/);
  assert.throws(() => smtpSettings({ SMTP_PORT: "0" }), /SMTP_PORT/);
  assert.throws(() => smtpSettings({ SMTP_HOST: "bad host" }), /SMTP_HOST/);
  assert.throws(() => smtpSettings({ SMTP_FROM: "Name <a@b.co>" }), /SMTP_FROM/);
});

test("rejected recipients are permanent while connection and credential problems are retried", () => {
  assert.deepEqual(classifyError({ responseCode: 550 }), { code: "550", permanent: true });
  assert.deepEqual(classifyError({ responseCode: 554 }), { code: "554", permanent: true });
  assert.deepEqual(classifyError({ responseCode: 421 }), { code: "421", permanent: false });
  assert.deepEqual(classifyError({ responseCode: 535, code: "EAUTH" }), { code: "535", permanent: false });
  assert.deepEqual(classifyError({ code: "ECONNECTION" }), { code: "ECONNECTION", permanent: false });
  assert.deepEqual(classifyError(new Error("boom")), { code: "UNKNOWN", permanent: false });
});

test("email templates escape user text, link into the site and describe preferences", () => {
  const mail = renderEmail(
    { title: "<b>Hi</b>", body: 'Line "one"\nSecond & <script>', link: "/bookings/1", category: "REMINDERS" },
    "https://activehub.example",
  );
  assert.ok(mail.html.includes("&lt;b&gt;Hi&lt;/b&gt;"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes('href="https://activehub.example/bookings/1"'));
  assert.ok(mail.text.includes("Open in ActiveHub: https://activehub.example/bookings/1"));
  assert.ok(mail.text.includes("https://activehub.example/profile"));
  const service = renderEmail({ title: "T", body: "B", link: "/x", category: "BOOKINGS" }, "https://a.example");
  assert.ok(service.text.includes("service message"));
  assert.ok(!service.text.includes("/profile"));
});

test("links stay on the site and the public URL comes from configuration", () => {
  assert.equal(absoluteLink("https://a.example", "/chat/1"), "https://a.example/chat/1");
  assert.equal(absoluteLink("https://a.example", "//evil.example"), "https://a.example");
  assert.equal(absoluteLink("https://a.example", "https://evil.example"), "https://a.example");
  assert.equal(publicBaseUrl({ APP_PUBLIC_URL: "https://activehub.example/path" }), "https://activehub.example");
  assert.equal(publicBaseUrl({ APP_ORIGINS: "http://localhost:8080,http://127.0.0.1:8080" }), "http://localhost:8080");
  assert.equal(publicBaseUrl({}), "http://localhost:8080");
  assert.throws(() => publicBaseUrl({ APP_PUBLIC_URL: "javascript:alert(1)" }), /APP_PUBLIC_URL/);
});
