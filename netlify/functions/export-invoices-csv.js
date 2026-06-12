const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase ist noch nicht konfiguriert.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toFixed(2).replace(".", ",");
}

function formatPeriod(payload) {
  const start = payload?.anreise || "";
  const end = payload?.abreise || "";
  if (!start && !end) return "";
  return `${start} bis ${end}`;
}

function summarizePositions(payload) {
  const positions = Array.isArray(payload?.positionen) ? payload.positionen : [];
  return positions
    .map((position) => {
      const description = position?.beschreibung || "";
      const gross = formatMoney(position?.summe);
      const tax = position?.steuersatz ? `${position.steuersatz} %` : "";
      return [description, gross ? `${gross} EUR` : "", tax].filter(Boolean).join(" / ");
    })
    .join(" | ");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const expectedPin = process.env.ARCHIVE_PIN;
    const providedPin = event.headers["x-archive-pin"] || event.headers["X-Archive-Pin"];
    if (!expectedPin) throw new Error("ARCHIVE_PIN ist noch nicht konfiguriert.");
    if (providedPin !== expectedPin) throw new Error("Archiv-PIN ist nicht korrekt.");

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_number, invoice_year, sequence_number, status, payload, totals, pdf_sha256, error_message, created_at, issued_at, updated_at")
      .order("invoice_year", { ascending: true })
      .order("sequence_number", { ascending: true });

    if (error) throw error;

    const headers = [
      "Rechnungsnummer",
      "Jahr",
      "Laufende Nummer",
      "Status",
      "Kunde",
      "Kunden-E-Mail",
      "Adresse",
      "Mietzeitraum",
      "Gesamtbetrag EUR",
      "Netto 7 % EUR",
      "USt 7 % EUR",
      "Netto 19 % EUR",
      "USt 19 % EUR",
      "Kulturfoerderabgabe EUR",
      "Positionen",
      "XML/PDF-Pruefsumme",
      "Erstellt am",
      "Ausgestellt am",
      "Aktualisiert am",
      "Fehlermeldung"
    ];

    const rows = (data || []).map((invoice) => {
      const payload = invoice.payload || {};
      const totals = invoice.totals || {};
      return [
        invoice.invoice_number,
        invoice.invoice_year,
        invoice.sequence_number,
        invoice.status,
        payload.name,
        payload.kundeEmail,
        payload.adresse,
        formatPeriod(payload),
        formatMoney(totals.payable ?? totals.gesamt),
        formatMoney(totals.net7),
        formatMoney(totals.vat7 ?? totals.mwst7),
        formatMoney(totals.net19),
        formatMoney(totals.vat19 ?? totals.mwst19),
        formatMoney(totals.kultur),
        summarizePositions(payload),
        invoice.pdf_sha256,
        formatDate(invoice.created_at),
        formatDate(invoice.issued_at),
        formatDate(invoice.updated_at),
        invoice.error_message
      ];
    });

    const csv = [
      headers.map(csvValue).join(";"),
      ...rows.map((row) => row.map(csvValue).join(";"))
    ].join("\r\n");

    const today = new Date().toISOString().slice(0, 10);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rechnungsauszug-${today}.csv"`,
        "Cache-Control": "no-store"
      },
      body: `\uFEFF${csv}`
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: String(error.message || error) })
    };
  }
};
