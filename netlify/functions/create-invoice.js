const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const PdfPrinter = require("pdfmake");
const { PDFDocument } = require("pdf-lib");

const COMPANY = {
  name: "Wohnzeit-Köln",
  displayName: "Wohnzeit-Köln",
  owner: "Sarah und David Brand",
  street: "Murgweg 2",
  zip: "51061",
  city: "Köln",
  phone: "+49 163 4734664",
  email: "brand-wohnzeit-koeln@gmx.de",
  bank: "Kreissparkasse Köln",
  iban: "DE96 3705 0299 0000 7168 73",
  bic: "COKSDE33XXX",
  taxNumber: "218/5025/7499"
};

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique"
  }
};

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return `${roundMoney(value).toFixed(2)} EUR`;
}

function includedVat(gross, rate) {
  return roundMoney(Number(gross || 0) * rate / (100 + rate));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin"
  }).format(date);
}

function formatIsoCompact(value) {
  if (!value) return "";
  return String(value).replaceAll("-", "");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function extractLastName(name) {
  const firstLine = sanitizeText(name).split(/\r?\n/)[0].trim();
  if (!firstLine) return "";
  const parts = firstLine
    .replace(/^(Herrn?|Frau|Familie)\s+/i, "")
    .replaceAll(",", " ")
    .split(/\s+/)
    .filter(Boolean);
  return parts.at(-1) || "";
}

function salutation(data) {
  const lastName = extractLastName(data.name);
  if (data.anrede === "Sehr geehrte Frau") {
    return lastName ? `Sehr geehrte Frau ${lastName},` : "Sehr geehrte Frau,";
  }
  if (data.anrede === "Sehr geehrter Herr") {
    return lastName ? `Sehr geehrter Herr ${lastName},` : "Sehr geehrter Herr,";
  }
  return "Sehr geehrte Damen und Herren,";
}

function bookingText(data) {
  return `vielen Dank für die Hausbuchung in der Zeit vom ${formatDate(data.anreise) || "xx"} bis ${formatDate(data.abreise) || "xx"} und Ihr Vertrauen.`;
}

function validatePayload(payload) {
  const required = ["datum", "name", "adresse", "anreise", "abreise"];
  const missing = required.filter((field) => !sanitizeText(payload[field]));
  if (missing.length) {
    throw new Error(`Bitte ausfuellen: ${missing.join(", ")}`);
  }
  if (!Array.isArray(payload.positionen) || payload.positionen.length === 0) {
    throw new Error("Mindestens eine Rechnungsposition ist erforderlich.");
  }
}

function recalculate(payload) {
  const positions = payload.positionen.map((position, index) => {
    const amount = roundMoney(position.anzahl || 1);
    const price = roundMoney(position.preis || position.summe || 0);
    const total = roundMoney(position.summe || amount * price);
    const description = sanitizeText(position.beschreibung);
    const isPet = /haustier/i.test(description);
    const isAccommodation = /uebernachtung|übernachtung/i.test(description);
    const taxRate = Number(position.steuersatz || (isPet ? 19 : 7));
    return {
      position: index + 1,
      beschreibung: description,
      anzahl: amount,
      preis: price,
      summe: total,
      steuersatz: taxRate,
      kfaRelevant: position.kfaRelevant ?? isAccommodation
    };
  }).filter((position) => position.beschreibung && position.summe > 0);

  const kfaBase = positions
    .filter((position) => position.kfaRelevant)
    .reduce((sum, position) => sum + position.summe, 0);
  const gross7 = positions
    .filter((position) => position.steuersatz === 7)
    .reduce((sum, position) => sum + position.summe, 0);
  const gross19 = positions
    .filter((position) => position.steuersatz === 19)
    .reduce((sum, position) => sum + position.summe, 0);
  const kultur = roundMoney(kfaBase * 0.05);
  const vat7 = includedVat(gross7, 7);
  const vat19 = includedVat(gross19, 19);
  const vat = roundMoney(vat7 + vat19);
  const net7 = roundMoney(gross7 - vat7);
  const net19 = roundMoney(gross19 - vat19);
  const net = roundMoney(net7 + net19);
  const subtotal = roundMoney(gross7 + gross19 + kultur);

  return {
    positionen: positions,
    kfaBemessungsgrundlage: roundMoney(kfaBase),
    brutto7: roundMoney(gross7),
    brutto19: roundMoney(gross19),
    kultur,
    mwst7: vat7,
    mwst19: vat19,
    mwst: vat,
    netto7: net7,
    netto19: net19,
    netto: net,
    gesamt: subtotal
  };
}

function createZugferdXml(data, totals, invoiceNumber) {
  const lines = totals.positionen.map((position, index) => `
<ram:IncludedSupplyChainTradeLineItem>
  <ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
  <ram:SpecifiedTradeProduct><ram:Name>${escapeXml(position.beschreibung)}</ram:Name></ram:SpecifiedTradeProduct>
  <ram:SpecifiedLineTradeAgreement><ram:GrossPriceProductTradePrice><ram:ChargeAmount>${position.summe.toFixed(2)}</ram:ChargeAmount></ram:GrossPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
  <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${position.anzahl || 1}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
  <ram:SpecifiedLineTradeSettlement>
    <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${position.steuersatz || 7}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
    <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${position.summe.toFixed(2)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
  </ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:factur-x.eu:1p0:basicwl</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${formatIsoCompact(data.datum)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(COMPANY.displayName)}</ram:Name>
        <ram:PostalTradeAddress><ram:PostcodeCode>${COMPANY.zip}</ram:PostcodeCode><ram:LineOne>${escapeXml(COMPANY.street)}</ram:LineOne><ram:CityName>${escapeXml(COMPANY.city)}</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${escapeXml(COMPANY.email)}</ram:URIID></ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${escapeXml(COMPANY.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${escapeXml(data.name)}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${escapeXml(invoiceNumber)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${COMPANY.iban.replaceAll(" ", "")}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount><ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${COMPANY.bic}</ram:BICID><ram:Name>${escapeXml(COMPANY.bank)}</ram:Name></ram:PayeeSpecifiedCreditorFinancialInstitution></ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${totals.mwst7.toFixed(2)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${totals.netto7.toFixed(2)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>7</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      ${totals.mwst19 > 0 ? `<ram:ApplicableTradeTax><ram:CalculatedAmount>${totals.mwst19.toFixed(2)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${totals.netto19.toFixed(2)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>` : ""}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${totals.netto.toFixed(2)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${totals.netto.toFixed(2)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount>${totals.mwst.toFixed(2)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${totals.gesamt.toFixed(2)}</ram:GrandTotalAmount><ram:DuePayableAmount>${totals.gesamt.toFixed(2)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

function createPdfDefinition(data, totals, invoiceNumber) {
  const customerAddress = [data.name, ...sanitizeText(data.adresse).split(/\r?\n/)]
    .filter(Boolean)
    .join("\n");

  return {
    pageSize: "A4",
    pageMargins: [48, 52, 48, 112],
    defaultStyle: {
      font: "Helvetica",
      fontSize: 10.5,
      lineHeight: 1.25
    },
    footer() {
      return {
        margin: [48, 0, 48, 26],
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 3, lineColor: "#0087c7" }] },
          {
            columns: [
              { text: `${COMPANY.displayName}\n${COMPANY.street}\n${COMPANY.zip} ${COMPANY.city}\n${COMPANY.owner}`, width: 124 },
              { text: `${COMPANY.phone}\n${COMPANY.email}`, width: 150 },
              { text: `${COMPANY.bank}\n${COMPANY.iban}\nBIC: ${COMPANY.bic}`, width: 155 },
              { text: `Steuernr.\n${COMPANY.taxNumber}`, width: "*" }
            ],
            columnGap: 8,
            alignment: "center",
            fontSize: 7.6,
            margin: [0, 7, 0, 0]
          }
        ]
      };
    },
    content: [
      {
        columns: [
          { text: `${COMPANY.displayName}\n${COMPANY.street}\n${COMPANY.zip} ${COMPANY.city}`, bold: true, width: "*" },
          {
            stack: [
              { text: "RECHNUNG", bold: true, fontSize: 22, alignment: "right", margin: [0, 0, 0, 18] },
              { text: `Rechnungsnummer: ${invoiceNumber}`, alignment: "right" },
              { text: `Rechnungsdatum: ${formatDate(data.datum)}`, alignment: "right" }
            ],
            width: 220
          }
        ],
        margin: [0, 0, 0, 48]
      },
      {
        columns: [
          {
            stack: [
              { text: `${COMPANY.displayName}, ${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}`, fontSize: 7.5, color: "#666666", decoration: "underline", margin: [0, 0, 0, 10] },
              { text: customerAddress, fontSize: 10.8, lineHeight: 1.35 }
            ],
            width: "*"
          },
          {
            text: `Mietzeitraum:\n${formatDate(data.anreise)} - ${formatDate(data.abreise)}`,
            alignment: "right",
            width: 170
          }
        ],
        margin: [0, 0, 0, 42]
      },
      { text: salutation(data), margin: [0, 0, 0, 10] },
      { text: bookingText(data), margin: [0, 0, 0, 10] },
      { text: "Hiermit erlauben wir uns die folgenden Leistungen in Rechnung zu stellen:", margin: [0, 0, 0, 22] },
      {
        table: {
          widths: [38, "*", 76, 82],
          headerRows: 1,
          body: [
            [
              { text: "Pos.", bold: true },
              { text: "Beschreibung", bold: true },
              { text: "Preis", bold: true, alignment: "right" },
              { text: "Gesamt", bold: true, alignment: "right" }
            ],
            ...totals.positionen.map((position) => [
              String(position.position),
              position.beschreibung,
              { text: position.preis ? money(position.preis) : "", alignment: "right" },
              { text: money(position.summe), alignment: "right" }
            ])
          ]
        },
        layout: {
          fillColor(rowIndex) {
            return rowIndex === 0 ? "#f3f3f3" : null;
          },
          hLineColor() {
            return "#d7d7d7";
          },
          vLineWidth() {
            return 0;
          },
          hLineWidth(rowIndex) {
            return rowIndex === 0 ? 0 : 0.7;
          }
        },
        margin: [0, 0, 0, 20]
      },
      {
        stack: [
          `Kulturförderabgabe Stadt Köln: ${money(totals.kultur)}`,
          `Enthaltene USt 7 %: ${money(totals.mwst7)}`,
          ...(totals.mwst19 > 0 ? [`Enthaltene USt 19 %: ${money(totals.mwst19)}`] : []),
          `Netto steuerpflichtige Leistungen: ${money(totals.netto)}`,
          { text: `Gesamtsumme: ${money(totals.gesamt)}`, bold: true, fontSize: 15, margin: [0, 9, 0, 0] }
        ],
        alignment: "right",
        margin: [0, 0, 0, 30]
      },
      { text: [{ text: "Zahlungsbedingungen: ", bold: true }, "Zahlung per sofort und ohne Abzüge."], fontSize: 9, margin: [0, 0, 0, 56] },
      { text: "Bei Rückfragen stehen wir selbstverständlich jederzeit gerne zur Verfügung.", fontSize: 12, margin: [0, 0, 0, 24] },
      { text: "Mit freundlichen Grüßen", fontSize: 12, margin: [0, 0, 0, 24] },
      { text: COMPANY.owner, fontSize: 12 }
    ],
    info: {
      title: `Rechnung ${invoiceNumber}`,
      author: COMPANY.displayName,
      subject: "ZUGFeRD-Rechnung",
      creator: "Billkill Rechnungsapp",
      producer: "pdfmake"
    }
  };
}

function createPdfBuffer(definition) {
  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(definition);
  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}

async function attachXml(pdfBuffer, xml, invoiceNumber) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  await pdfDoc.attach(Buffer.from(xml, "utf8"), "factur-x.xml", {
    mimeType: "application/xml",
    description: `ZUGFeRD Rechnungsdaten ${invoiceNumber}`,
    creationDate: new Date(),
    modificationDate: new Date()
  });
  return Buffer.from(await pdfDoc.save());
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase ist noch nicht konfiguriert: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let invoiceRecordId = null;
  let supabase = null;

  try {
    supabase = getSupabase();
    const payload = JSON.parse(event.body || "{}");
    validatePayload(payload);
    const totals = recalculate(payload);
    const year = Number(String(payload.datum).slice(0, 4)) || new Date().getFullYear();

    const { data: numberRows, error: numberError } = await supabase.rpc("allocate_invoice_number", { p_year: year });
    if (numberError) throw numberError;

    const allocated = Array.isArray(numberRows) ? numberRows[0] : numberRows;
    const invoiceNumber = allocated.invoice_number;
    const sequenceNumber = allocated.sequence_number;
    const xml = createZugferdXml(payload, totals, invoiceNumber);

    const { data: inserted, error: insertError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        invoice_year: year,
        sequence_number: sequenceNumber,
        status: "rendering",
        payload,
        totals,
        zugferd_xml: xml
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    invoiceRecordId = inserted.id;

    const pdfBuffer = await createPdfBuffer(createPdfDefinition(payload, totals, invoiceNumber));
    const finalPdf = await attachXml(pdfBuffer, xml, invoiceNumber);
    const pdfSha = crypto.createHash("sha256").update(finalPdf).digest("hex");

    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: "issued", pdf_sha256: pdfSha, issued_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", invoiceRecordId);
    if (updateError) throw updateError;

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rechnung-${invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
        "X-Invoice-Number": invoiceNumber,
        "X-Invoice-Id": invoiceRecordId
      },
      body: finalPdf.toString("base64")
    };
  } catch (error) {
    if (supabase && invoiceRecordId) {
      await supabase
        .from("invoices")
        .update({ status: "failed", error_message: String(error.message || error), updated_at: new Date().toISOString() })
        .eq("id", invoiceRecordId);
    }

    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: String(error.message || error) })
    };
  }
};
