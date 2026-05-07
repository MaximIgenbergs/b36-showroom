import type { APIRoute } from "astro";
import { Resend } from "resend";

export const prerender = false;

const TO_EMAIL = "info@villa-bausewein.de";
const FROM_EMAIL = "Villa Bausewein <bewerbung@villa-bausewein.de>";
const MAX_FILE_SIZE = 4 * 1024 * 1024;

const PRAEFERENZ_LABELS: Record<string, string> = {
  ug: "Untergeschoss",
  eg: "Erdgeschoss (mit Terrasse)",
  og: "Obergeschoss (mit Balkon)",
  dg: "Dachgeschoss (mit Balkon)",
  doppel: "Doppelapartment D3 (ca. 34 m²)",
};

const formatEinzug = (iso: string) => {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const escapeHtml = (str: string) =>
  str.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY ist nicht gesetzt");
    return json(500, { error: "Server-Konfiguration unvollständig." });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }

  if (formData.get("_gotcha")) {
    return json(200, { ok: true });
  }

  const get = (key: string) => (formData.get(key) ?? "").toString().trim();

  const vorname = get("vorname");
  const nachname = get("nachname");
  const email = get("email");
  const telefon = get("telefon");
  const einzug = get("einzug");
  const hochschule = get("hochschule");
  const praeferenz = get("praeferenz");
  const nachricht = get("nachricht");
  const datenschutz = formData.get("datenschutz");
  const maklerHinweis = formData.get("makler-hinweis");

  if (
    !vorname ||
    !nachname ||
    !email ||
    !einzug ||
    !hochschule ||
    !datenschutz ||
    !maklerHinweis
  ) {
    return json(400, { error: "Bitte alle Pflichtfelder ausfüllen." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Bitte eine gültige E-Mail-Adresse angeben." });
  }

  const file = formData.get("immatrikulation");
  if (!(file instanceof File) || file.size === 0) {
    return json(400, { error: "Bitte einen Berechtigungsschein hochladen." });
  }
  if (file.size > MAX_FILE_SIZE) {
    return json(400, { error: "Datei ist größer als 4 MB." });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const praeferenzAnzeige = praeferenz
    ? (PRAEFERENZ_LABELS[praeferenz] ?? praeferenz)
    : "—";

  const einzugAnzeige = formatEinzug(einzug);

  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;width:180px;">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${value}</td></tr>`;

  const html = `
<div style="font-family: -apple-system, Arial, sans-serif; color: #2a2a2a; max-width: 640px;">
  <h2 style="font-family: Georgia, serif; color: #1a1a1a; border-bottom: 2px solid #c9a961; padding-bottom: 8px;">
    Neue Bewerbung über das Kontaktformular
  </h2>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    ${row("Vorname", escapeHtml(vorname))}
    ${row("Nachname", escapeHtml(nachname))}
    ${row("E-Mail", `<a href="mailto:${escapeHtml(email)}" style="color:#c9a961;">${escapeHtml(email)}</a>`)}
    ${row("Telefon", telefon ? escapeHtml(telefon) : "—")}
    ${row("Einzugstermin", escapeHtml(einzugAnzeige))}
    ${row("Dienstverhältnis", escapeHtml(hochschule))}
    ${row("Apartment-Präferenz", escapeHtml(praeferenzAnzeige))}
  </table>
  ${
    nachricht
      ? `<h3 style="font-family: Georgia, serif; margin-top: 24px;">Anschreiben</h3>
         <p style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(nachricht)}</p>`
      : ""
  }
  <p style="margin-top: 24px; padding: 12px; background: #f7f5f0; font-size: 13px; color: #555;">
    Berechtigungsschein im Anhang: <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(0)} KB)
  </p>
  <p style="margin-top: 16px; font-size: 12px; color: #888;">
    Direkt antworten an den Bewerber: einfach auf "Antworten" klicken.
  </p>
</div>`;

  const text = [
    "Neue Bewerbung über das Kontaktformular",
    "",
    `Vorname:             ${vorname}`,
    `Nachname:            ${nachname}`,
    `E-Mail:              ${email}`,
    `Telefon:             ${telefon || "—"}`,
    `Einzugstermin:       ${einzugAnzeige}`,
    `Dienstverhältnis:    ${hochschule}`,
    `Apartment-Präferenz: ${praeferenzAnzeige}`,
    "",
    nachricht ? `Anschreiben:\n${nachricht}` : "",
    "",
    `Berechtigungsschein im Anhang: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [TO_EMAIL],
    replyTo: email,
    subject: `Bewerbung: ${vorname} ${nachname}`,
    html,
    text,
    attachments: [{ filename: file.name, content: fileBuffer }],
  });

  if (error) {
    console.error("Resend error:", error);
    return json(502, { error: "E-Mail-Versand fehlgeschlagen." });
  }

  return json(200, { ok: true });
};
