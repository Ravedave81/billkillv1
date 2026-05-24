const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const COMPANY = {
  name: "Wohnzeit-Köln",
  owner: "Sarah und David Brand",
  street: "Murgweg 2",
  zip: "51061",
  city: "Köln",
  phone: "+49 163 4734664",
  email: "brand-wohnzeit-koeln@gmx.de",
  bank: "Kreissparkasse Köln",
  iban: "DE96370502990000716873",
  bic: "COKSDE33XXX",
  taxNumber: "218/5025/7499"
};

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function netFromGross(gross, rate) {
  return roundMoney(Number(gross || 0) * 100 / (100 + rate));
}

function vatFromGross(gross, rate) {
  return roundMoney(Number(gross || 0) * rate / (100 + rate));
}

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sanitize(value) {
  return String(value ?? "").trim();
}

function requireEmail(value) {
  const email = sanitize(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Bitte eine gültige Kunden-E-Mail für die XRechnung eintragen.");
  }
  return email;
}

function splitAddress(address) {
  const lines = sanitize(address).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const street = lines[0] || "Adresse fehlt";
  const zipCity = lines.find((line) => /\b\d{5}\b/.test(line)) || "";
  const zipMatch = zipCity.match(/\b(\d{5})\b/);
  const zip = zipMatch ? zipMatch[1] : "00000";
  const city = zipMatch ? zipCity.replace(zipMatch[1], "").trim() || "Ort fehlt" : "Ort fehlt";
  return { street, zip, city, country: "DE" };
}

function recalculate(payload) {
  const positions = (payload.positionen || []).map((position, index) => {
    const description = sanitize(position.beschreibung);
    const isPet = /haustier/i.test(description);
    const isAccommodation = /uebernachtung|übernachtung|endreinigung/i.test(description);
    const rate = Number(position.steuersatz || (isPet ? 19 : 7));
    const quantity = roundMoney(position.anzahl || 1);
    const gross = roundMoney(position.summe || quantity * Number(position.preis || 0));
    const net = netFromGross(gross, rate);
    const unitNet = quantity ? roundMoney(net / quantity) : net;
    return {
      id: index + 1,
      description,
      quantity,
      gross,
      net,
      unitNet,
      rate,
      kfaRelevant: position.kfaRelevant ?? isAccommodation
    };
  }).filter((position) => position.description && position.gross > 0);

  const kfaBase = positions.filter((position) => position.kfaRelevant).reduce((sum, position) => sum + position.gross, 0);
  const kultur = roundMoney(kfaBase * 0.05);
  const net7 = roundMoney(positions.filter((position) => position.rate === 7).reduce((sum, position) => sum + position.net, 0));
  const net19 = roundMoney(positions.filter((position) => position.rate === 19).reduce((sum, position) => sum + position.net, 0));
  const vat7 = vatFromGross(positions.filter((position) => position.rate === 7).reduce((sum, position) => sum + position.gross, 0), 7);
  const vat19 = vatFromGross(positions.filter((position) => position.rate === 19).reduce((sum, position) => sum + position.gross, 0), 19);
  const lineNet = roundMoney(net7 + net19);
  const taxExclusive = roundMoney(lineNet + kultur);
  const taxTotal = roundMoney(vat7 + vat19);
  const payable = roundMoney(taxExclusive + taxTotal);

  return { positions, kultur, net7, net19, vat7, vat19, lineNet, taxExclusive, taxTotal, payable };
}

function requirePayload(payload) {
  const missing = ["datum", "name", "adresse", "anreise", "abreise"].filter((field) => !sanitize(payload[field]));
  if (missing.length) throw new Error(`Bitte ausfüllen: ${missing.join(", ")}`);
  requireEmail(payload.kundeEmail);
  if (!Array.isArray(payload.positionen) || payload.positionen.length === 0) throw new Error("Mindestens eine Rechnungsposition ist erforderlich.");
}

function taxSubtotalXml(amount, taxable, rate) {
  if (amount <= 0 && taxable <= 0) return "";
  return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${taxable.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${amount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${rate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
}

function exemptSubtotalXml(taxable) {
  if (taxable <= 0) return "";
  return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${taxable.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>E</cbc:ID>
        <cbc:Percent>0.00</cbc:Percent>
        <cbc:TaxExemptionReason>Nicht umsatzsteuerpflichtige kommunale Abgabe</cbc:TaxExemptionReason>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
}

function createXrechnungXml(payload, totals, invoiceNumber) {
  const buyer = splitAddress(payload.adresse);
  const buyerEmail = requireEmail(payload.kundeEmail);
  const lines = totals.positions.map((position) => `
  <cac:InvoiceLine>
    <cbc:ID>${position.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${position.quantity.toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${position.net.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xml(position.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${position.rate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${position.unitNet.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xml(invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${xml(payload.datum)}</cbc:IssueDate>
  <cbc:DueDate>${xml(payload.datum)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>Keine Leitweg-ID</cbc:BuyerReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${xml(COMPANY.email)}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID>${xml(COMPANY.taxNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xml(COMPANY.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xml(COMPANY.street)}</cbc:StreetName>
        <cbc:CityName>${xml(COMPANY.city)}</cbc:CityName>
        <cbc:PostalZone>${xml(COMPANY.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${xml(COMPANY.taxNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xml(COMPANY.name)}</cbc:RegistrationName>
        <cbc:CompanyID>${xml(COMPANY.taxNumber)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Name>${xml(COMPANY.owner)}</cbc:Name>
        <cbc:Telephone>${xml(COMPANY.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${xml(COMPANY.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${xml(buyerEmail)}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${xml(payload.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xml(buyer.street)}</cbc:StreetName>
        <cbc:CityName>${xml(buyer.city)}</cbc:CityName>
        <cbc:PostalZone>${xml(buyer.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${xml(buyer.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xml(payload.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${xml(COMPANY.iban)}</cbc:ID>
      <cbc:Name>${xml(COMPANY.bank)}</cbc:Name>
      <cac:FinancialInstitutionBranch><cbc:ID>${xml(COMPANY.bic)}</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Kulturförderabgabe Stadt Köln</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="EUR">${totals.kultur.toFixed(2)}</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>E</cbc:ID>
      <cbc:Percent>0.00</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${totals.taxTotal.toFixed(2)}</cbc:TaxAmount>${taxSubtotalXml(totals.vat7, totals.net7, 7)}${taxSubtotalXml(totals.vat19, totals.net19, 19)}${exemptSubtotalXml(totals.kultur)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${totals.lineNet.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${totals.taxExclusive.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${totals.payable.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="EUR">0.00</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="EUR">${totals.kultur.toFixed(2)}</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="EUR">${totals.payable.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase ist noch nicht konfiguriert.");
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let invoiceRecordId = null;
  let supabase = null;
  try {
    const payload = JSON.parse(event.body || "{}");
    requirePayload(payload);
    const totals = recalculate(payload);
    const year = Number(String(payload.datum).slice(0, 4)) || new Date().getFullYear();
    supabase = getSupabase();

    const { data: numberRows, error: numberError } = await supabase.rpc("allocate_invoice_number", { p_year: year });
    if (numberError) throw numberError;
    const allocated = Array.isArray(numberRows) ? numberRows[0] : numberRows;
    const invoiceNumber = allocated.invoice_number;
    const sequenceNumber = allocated.sequence_number;
    const xrechnungXml = createXrechnungXml(payload, totals, invoiceNumber);
    const xmlSha = crypto.createHash("sha256").update(xrechnungXml).digest("hex");

    const { data: inserted, error: insertError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        invoice_year: year,
        sequence_number: sequenceNumber,
        status: "issued",
        payload,
        totals,
        zugferd_xml: xrechnungXml,
        pdf_sha256: xmlSha,
        issued_at: new Date().toISOString()
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    invoiceRecordId = inserted.id;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="xrechnung-${invoiceNumber}.xml"`,
        "Cache-Control": "no-store",
        "X-Invoice-Number": invoiceNumber,
        "X-Invoice-Id": invoiceRecordId
      },
      body: xrechnungXml
    };
  } catch (error) {
    if (supabase && invoiceRecordId) {
      await supabase.from("invoices").update({ status: "failed", error_message: String(error.message || error), updated_at: new Date().toISOString() }).eq("id", invoiceRecordId);
    }
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: String(error.message || error) })
    };
  }
};

