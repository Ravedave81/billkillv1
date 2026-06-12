const UNTERNEHMEN = {
  name: "Wohnzeit-Köln",
  inhaber: "Sarah und David Brand",
  strasse: "Murgweg 2",
  plz: "51061",
  ort: "Köln",
  telefon: "+49 163/4734664",
  telefonUri: "+491634734664",
  email: "brand-wohnzeit-koeln@gmx.de",
  bank: "Kreissparkasse Köln",
  iban: "DE96 3705 0299 0000 7168 73",
  bic: "COKSDE33XXX",
  steuernummer: "218/5025/7499"
}

function nachtHinzufuegen(){
  const html = `
    <div class="nacht">
      <label>Nächte</label>
      <input type="number" class="nachtAnzahl" value="1" min="0" step="1">
      <label>Preis pro Nacht (€)</label>
      <input type="number" class="nachtPreis" value="195" min="0" step="0.01">
      <button onclick="this.parentElement.remove(); berechnen()">entfernen</button>
    </div>`
  document.getElementById("nachtListe").insertAdjacentHTML("beforeend", html)
}

function formatDatum(datum){
  if(!datum) return ""
  const d = new Date(datum)
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`
}

function formatISO(datum){
  if(!datum) return ""
  return new Date(datum).toISOString().split("T")[0]
}

function formatEUR(wert){
  return `${Number(wert || 0).toFixed(2)} Euro`
}

function rundeGeld(wert){
  return Math.round((Number(wert || 0) + Number.EPSILON) * 100) / 100
}

function enthalteneUst(brutto, steuersatz){
  return rundeGeld(Number(brutto || 0) * steuersatz / (100 + steuersatz))
}

function esc(text){
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function extrahiereNachname(name){
  const ersteZeile = String(name ?? "").split(/\r?\n/)[0].trim()
  if(!ersteZeile) return ""
  const teile = ersteZeile
    .replace(/^(Herrn?|Frau|Familie)\s+/i, "")
    .replaceAll(",", " ")
    .split(/\s+/)
    .filter(Boolean)
  return teile.at(-1) || ""
}

function erstelleAnrede(anrede, name){
  const nachname = extrahiereNachname(name)
  if(anrede === "Sehr geehrte Frau") return nachname ? `Sehr geehrte Frau ${nachname}` : "Sehr geehrte Frau"
  if(anrede === "Sehr geehrter Herr") return nachname ? `Sehr geehrter Herr ${nachname}` : "Sehr geehrter Herr"
  return "Sehr geehrte Damen und Herren"
}

function erstelleBuchungstext(anreise, abreise){
  return `vielen Dank für die Hausbuchung in der Zeit vom ${formatDatum(anreise) || "xx"} bis ${formatDatum(abreise) || "xx"} und Ihr Vertrauen.`
}

function berechneNaechte(){
  const anreise = document.getElementById("anreise").value
  const abreise = document.getElementById("abreise").value
  if(!anreise || !abreise) return
  const naechte = (new Date(abreise) - new Date(anreise)) / (1000 * 60 * 60 * 24)
  const ersteNacht = document.querySelector(".nachtAnzahl")
  if(ersteNacht && Number.isFinite(naechte) && naechte >= 0) ersteNacht.value = naechte
}

function sammleRechnungsDaten(){
  const positionen = []
  let kfaBemessungsgrundlage = 0
  let brutto7 = 0
  let brutto19 = 0
  const anzahlFelder = document.querySelectorAll(".nachtAnzahl")
  const preisFelder = document.querySelectorAll(".nachtPreis")

  anzahlFelder.forEach((feld, index) => {
    const anzahl = Number(feld.value || 0)
    const preis = Number(preisFelder[index]?.value || 0)
    const summe = anzahl * preis
    if(anzahl > 0 && preis > 0){
      kfaBemessungsgrundlage += summe
      brutto7 += summe
      positionen.push({
        position: positionen.length + 1,
        beschreibung: `${anzahl}x Übernachtung ohne Verpflegung`,
        preis,
        summe,
        anzahl,
        steuersatz: 7,
        kfaRelevant: true
      })
    }
  })

  const sonderAnzahl = Number(document.getElementById("sonderNaechte")?.value || 0)
  const sonderPreis = Number(document.getElementById("sonderPreis")?.value || 0)
  const sonderSumme = sonderAnzahl * sonderPreis
  if(sonderAnzahl > 0 && sonderPreis > 0){
    kfaBemessungsgrundlage += sonderSumme
    brutto7 += sonderSumme
    positionen.push({
      position: positionen.length + 1,
      beschreibung: `${sonderAnzahl}x Übernachtung zu Sonderkondition`,
      preis: sonderPreis,
      summe: sonderSumme,
      anzahl: sonderAnzahl,
      steuersatz: 7,
      kfaRelevant: true
    })
  }

  const haustier = Number(document.getElementById("haustier").value || 0)
  const reinigung = Number(document.getElementById("reinigung").value || 0)
  if(haustier > 0){
    brutto19 += haustier
    positionen.push({ position: "", beschreibung: "Haustier (inkl. 19 % MwSt.)", preis: 0, summe: haustier, anzahl: 1, steuersatz: 19, kfaRelevant: false })
  }
  if(reinigung > 0){
    brutto7 += reinigung
    kfaBemessungsgrundlage += reinigung
    positionen.push({ position: "", beschreibung: "Endreinigung", preis: 0, summe: reinigung, anzahl: 1, steuersatz: 7, kfaRelevant: true })
  }

  const kultur = rundeGeld(kfaBemessungsgrundlage * 0.05)
  const mwst7 = enthalteneUst(brutto7, 7)
  const mwst19 = enthalteneUst(brutto19, 19)
  const mwst = rundeGeld(mwst7 + mwst19)
  const netto7 = rundeGeld(brutto7 - mwst7)
  const netto19 = rundeGeld(brutto19 - mwst19)
  const netto = rundeGeld(netto7 + netto19)
  const gesamt = rundeGeld(brutto7 + brutto19 + kultur)

  return {
    rechnung: document.getElementById("rechnungsnummer").value,
    datum: document.getElementById("datum").value,
    anrede: document.getElementById("anrede").value,
    name: document.getElementById("name").value,
    adresse: document.getElementById("adresse").value,
    kundeEmail: document.getElementById("kundeEmail")?.value || "",
    anreise: document.getElementById("anreise").value,
    abreise: document.getElementById("abreise").value,
    positionen,
    kfaBemessungsgrundlage,
    brutto7,
    brutto19,
    kultur,
    mwst7,
    mwst19,
    mwst,
    netto7,
    netto19,
    netto,
    gesamt,
    unternehmen: UNTERNEHMEN
  }
}

function berechnen(){
  const daten = sammleRechnungsDaten()
  document.getElementById("positionen").innerHTML = daten.positionen.map((p) => `
    <tr>
      <td>${p.position || ""}</td>
      <td>${esc(p.beschreibung)}</td>
      <td style="text-align:right;white-space:nowrap">${p.preis ? formatEUR(p.preis) : ""}</td>
      <td style="text-align:right;white-space:nowrap">${formatEUR(p.summe)}</td>
    </tr>`).join("")

  document.getElementById("kultur").innerHTML = formatEUR(daten.kultur)
  document.getElementById("mwst").innerHTML = daten.mwst19 > 0
    ? `7 %: ${formatEUR(daten.mwst7)}<br>19 %: ${formatEUR(daten.mwst19)}`
    : formatEUR(daten.mwst7)
  document.getElementById("netto").innerHTML = formatEUR(daten.netto)
  document.getElementById("gesamt").innerHTML = formatEUR(daten.gesamt)
  document.getElementById("zeitraum").innerText = `${formatDatum(daten.anreise)}-${formatDatum(daten.abreise)}`
  document.getElementById("r_nummer").innerText = daten.rechnung
  document.getElementById("r_datum").innerText = formatDatum(daten.datum)
  document.getElementById("kundeAdresse").innerHTML = `${esc(daten.name)}<br>${esc(daten.adresse).replaceAll("\n", "<br>")}`
  document.getElementById("anredeText").innerText = `${erstelleAnrede(daten.anrede, daten.name)},`
  document.getElementById("buchungsDankText").innerText = erstelleBuchungstext(daten.anreise, daten.abreise)
}

function downloadDatei(inhalt, dateiname, mimeType){
  const blob = new Blob([inhalt], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = dateiname
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 1000)
}

function setServerStatus(text, typ = "info"){
const status = document.getElementById("serverStatus")
if(status){
status.innerText = text || ""
status.className = `server-status server-status-${typ}`
}
}

function dateinameAusHeader(headerValue, fallback){
if(!headerValue) return fallback
const match = headerValue.match(/filename="?([^"]+)"?/i)
return match ? match[1] : fallback
}

async function erstelleServerRechnung(){
berechnen()
const button = document.getElementById("serverPdfButton")
const daten = sammleRechnungsDaten()

if(button){
button.disabled = true
}
setServerStatus("Rechnung wird serverseitig erstellt ...", "info")

try{
const response = await fetch("/.netlify/functions/create-invoice", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(daten)
})

if(!response.ok){
let fehler = "Die Server-Rechnung konnte nicht erstellt werden."
try{
const json = await response.json()
if(json?.error) fehler = json.error
}catch(_err){}
throw new Error(fehler)
}

const invoiceNumber = response.headers.get("X-Invoice-Number")
if(invoiceNumber){
document.getElementById("rechnungsnummer").value = invoiceNumber
document.getElementById("r_nummer").innerText = invoiceNumber
}

const blob = await response.blob()
const dateiname = dateinameAusHeader(
response.headers.get("Content-Disposition"),
`rechnung-${invoiceNumber || "final"}.pdf`
)
downloadDatei(blob, dateiname, "application/pdf")
setServerStatus(invoiceNumber ? `Fertige Rechnung ${invoiceNumber} wurde geladen.` : "Fertige Rechnung wurde geladen.", "success")
}catch(error){
setServerStatus(error.message || "Unbekannter Fehler beim Erstellen der Rechnung.", "error")
}finally{
if(button){
button.disabled = false
}
}
}

async function erstelleFinaleXRechnung(){
berechnen()
const button = document.getElementById("xrechnungButton")
const daten = sammleRechnungsDaten()

if(button){
button.disabled = true
}
setServerStatus("Finale XRechnung wird serverseitig erstellt ...", "info")

try{
const response = await fetch("/.netlify/functions/create-xrechnung", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(daten)
})

if(!response.ok){
let fehler = "Die finale XRechnung konnte nicht erstellt werden."
try{
const json = await response.json()
if(json?.error) fehler = json.error
}catch(_err){}
throw new Error(fehler)
}

const invoiceNumber = response.headers.get("X-Invoice-Number")
if(invoiceNumber){
document.getElementById("rechnungsnummer").value = invoiceNumber
document.getElementById("r_nummer").innerText = invoiceNumber
}

const xmlBlob = await response.blob()
const dateiname = dateinameAusHeader(
response.headers.get("Content-Disposition"),
`xrechnung-${invoiceNumber || "final"}.xml`
)
downloadDatei(xmlBlob, dateiname, "application/xml")
setServerStatus(invoiceNumber ? `Finale XRechnung ${invoiceNumber} wurde geladen.` : "Finale XRechnung wurde geladen.", "success")
}catch(error){
setServerStatus(error.message || "Unbekannter Fehler beim Erstellen der XRechnung.", "error")
}finally{
if(button){
button.disabled = false
}
}
}

async function pruefeSupabaseStatus(optionen = {}){
const button = document.getElementById("supabaseStatusButton")
if(button){
button.disabled = true
}
setServerStatus(optionen.auto ? "Supabase wird beim Start geprüft ..." : "Supabase wird geprüft ...", "info")

try{
const response = await fetch("/.netlify/functions/health-check", {
method: "GET",
headers: { "Accept": "application/json" },
cache: "no-store"
})
let json = {}
try{
json = await response.json()
}catch(_err){}
if(!response.ok || !json.ok){
if(response.status === 404){
throw new Error("Supabase-Prüfung ist hier nicht verfügbar. Bitte die Netlify-App öffnen, nicht GitHub Pages.")
}
throw new Error(json.message || json.error || "Supabase antwortet nicht. Bitte Supabase Dashboard prüfen oder Projekt reaktivieren.")
}
setServerStatus(json.message || "Supabase ist erreichbar.", "success")
}catch(error){
setServerStatus(error.message || "Supabase konnte nicht geprüft werden. Lokal bitte Netlify Dev und .env prüfen.", "error")
}finally{
if(button){
button.disabled = false
}
}
}

async function ladeRechnungsauszugCsv(){
const button = document.getElementById("rechnungsauszugButton")
const pin = document.getElementById("archivPin")?.value || ""
if(!pin){
setServerStatus("Bitte zuerst die Archiv-PIN eintragen.", "error")
return
}
if(button){
button.disabled = true
}
setServerStatus("Rechnungsauszug wird erstellt ...", "info")

try{
const response = await fetch("/.netlify/functions/export-invoices-csv", {
method: "GET",
headers: { "Accept": "text/csv", "X-Archive-Pin": pin },
cache: "no-store"
})

if(!response.ok){
let fehler = "Der Rechnungsauszug konnte nicht erstellt werden."
try{
const json = await response.json()
if(json?.error) fehler = json.error
}catch(_err){}
throw new Error(fehler)
}

const csvBlob = await response.blob()
const dateiname = dateinameAusHeader(
response.headers.get("Content-Disposition"),
`rechnungsauszug-${new Date().toISOString().slice(0, 10)}.csv`
)
downloadDatei(csvBlob, dateiname, "text/csv;charset=utf-8")
setServerStatus("Rechnungsauszug wurde geladen.", "success")
}catch(error){
setServerStatus(error.message || "Unbekannter Fehler beim Erstellen des Rechnungsauszuges.", "error")
}finally{
if(button){
button.disabled = false
}
}
}

function drawLines(page, lines, x, y, options){
  const { font, size, color, lineHeight = size + 4 } = options
  lines.filter(Boolean).forEach((line, index) => {
    page.drawText(String(line), { x, y: y - index * lineHeight, size, font, color })
  })
}

function drawWrappedText(page, text, x, y, options){
  const { font, size, color, maxWidth, lineHeight = size + 4 } = options
  const words = String(text || "").split(/\s+/)
  let line = ""
  let currentY = y
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word
    if(maxWidth && font.widthOfTextAtSize(test, size) > maxWidth && line){
      page.drawText(line, { x, y: currentY, size, font, color })
      currentY -= lineHeight
      line = word
    }else{
      line = test
    }
  })
  if(line){
    page.drawText(line, { x, y: currentY, size, font, color })
    currentY -= lineHeight
  }
  return currentY
}

async function erstellePdfBeleg(){
  const button = document.getElementById("pdfBelegButton")
  if(button){
    button.disabled = true
  }
  setServerStatus("PDF-Beleg wird erstellt ...", "info")
  try{
  if(!window.PDFLib){
    throw new Error("Die PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.")
  }
  berechnen()
  const d = sammleRechnungsDaten()
  const u = d.unternehmen
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(`Rechnung ${d.rechnung || ""}`.trim())
  pdfDoc.setAuthor(u.name)
  pdfDoc.setSubject("Lesbarer PDF-Beleg ohne eingebettete Rechnungs-XML")
  pdfDoc.setCreator("Wohnzeit-Köln Rechnungsapp")
  pdfDoc.setProducer("pdf-lib")
  pdfDoc.setKeywords(["PDF-Beleg", "Rechnung"])

  const page = pdfDoc.addPage([595.28, 841.89])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const black = rgb(0, 0, 0)
  const blue = rgb(0, 0.529, 0.784)
  const grey = rgb(0.831, 0.831, 0.831)
  const marginL = 56
  const marginR = 539
  let y = 790

  page.drawText(`${u.name}, ${u.strasse}, ${u.plz} ${u.ort}`, { x: marginL, y, size: 9, font: bold, color: blue })
  page.drawText("RECHNUNG", { x: 390, y: 785, size: 28, font: bold, color: blue })
  y -= 52
  page.drawText("Rechnungsnummer:", { x: 330, y, size: 10, font: bold, color: black })
  page.drawText(d.rechnung || "", { x: 448, y, size: 10, font, color: black })
  y -= 15
  page.drawText("Rechnungsdatum:", { x: 330, y, size: 10, font: bold, color: black })
  page.drawText(formatDatum(d.datum), { x: 448, y, size: 10, font, color: black })
  y -= 15
  page.drawText("Mietzeitraum:", { x: 330, y, size: 10, font: bold, color: black })
  page.drawText(`${formatDatum(d.anreise)}-${formatDatum(d.abreise)}`, { x: 448, y, size: 10, font, color: black })

  page.drawText(`${u.name} ${u.strasse}, ${u.plz} ${u.ort}`, { x: marginL, y: 704, size: 7, font, color: rgb(0.4, 0.4, 0.4) })
  drawLines(page, [d.name, ...String(d.adresse || "").split(/\r?\n/)], marginL, 685, { font, size: 11, color: black, lineHeight: 15 })

  y = 602
  y = drawWrappedText(page, `${erstelleAnrede(d.anrede, d.name)},`, marginL, y, { font, size: 11, color: black, maxWidth: 480, lineHeight: 15 }) - 4
  y = drawWrappedText(page, erstelleBuchungstext(d.anreise, d.abreise), marginL, y, { font, size: 11, color: black, maxWidth: 480, lineHeight: 15 }) - 4
  y = drawWrappedText(page, "Hiermit erlauben wir uns die folgenden Leistungen in Rechnung zu stellen:", marginL, y, { font, size: 11, color: black, maxWidth: 480, lineHeight: 15 }) - 18

  page.drawRectangle({ x: marginL, y: y - 6, width: marginR - marginL, height: 22, color: blue })
  page.drawText("Pos.", { x: marginL + 4, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) })
  page.drawText("Beschreibung", { x: marginL + 56, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) })
  page.drawText("Bruttopreis", { x: 380, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) })
  page.drawText("Gesamtpreis", { x: 468, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) })
  y -= 22

  d.positionen.forEach((p, index) => {
    page.drawText(String(p.position || index + 1), { x: marginL + 4, y, size: 10, font, color: black })
    page.drawText(p.beschreibung, { x: marginL + 56, y, size: 10, font, color: black })
    if(p.preis) page.drawText(formatEUR(p.preis), { x: 374, y, size: 10, font, color: black })
    page.drawText(formatEUR(p.summe), { x: 468, y, size: 10, font, color: black })
    page.drawLine({ start: { x: marginL, y: y - 7 }, end: { x: marginR, y: y - 7 }, thickness: 0.5, color: grey })
    y -= 22
  })

  page.drawText("Kulturförderabgabe der Stadt Köln", { x: marginL + 56, y, size: 10, font, color: black })
  page.drawText(formatEUR(d.kultur), { x: 468, y, size: 10, font, color: black })
  page.drawLine({ start: { x: marginL, y: y - 7 }, end: { x: marginR, y: y - 7 }, thickness: 0.5, color: grey })
  y -= 30
  page.drawText("Enthaltene USt 7 %", { x: 320, y, size: 10, font: bold, color: black })
  page.drawText(formatEUR(d.mwst7), { x: 468, y, size: 10, font: bold, color: black })
  if(d.mwst19 > 0){
    y -= 16
    page.drawText("Enthaltene USt 19 %", { x: 320, y, size: 10, font: bold, color: black })
    page.drawText(formatEUR(d.mwst19), { x: 468, y, size: 10, font: bold, color: black })
  }
  y -= 16
  page.drawText("Netto steuerpflichtige Leistungen", { x: 320, y, size: 10, font, color: black })
  page.drawText(formatEUR(d.netto), { x: 468, y, size: 10, font, color: black })
  y -= 24
  page.drawRectangle({ x: 316, y: y - 4, width: 223, height: 22, color: blue })
  page.drawText("Gesamtsumme", { x: 320, y: y + 2, size: 11, font: bold, color: rgb(1, 1, 1) })
  page.drawText(formatEUR(d.gesamt), { x: 446, y: y + 2, size: 11, font: bold, color: rgb(1, 1, 1) })

  y -= 40
  page.drawText("Zahlungsbedingungen: Zahlung per sofort und ohne Abzüge.", { x: marginL, y, size: 9, font, color: black })
  y -= 54
  page.drawText("Bei Rückfragen stehen wir selbstverständlich jederzeit gerne zur Verfügung.", { x: marginL, y, size: 12, font, color: black })
  y -= 28
  page.drawText("Mit freundlichen Grüßen", { x: marginL, y, size: 12, font, color: black })
  y -= 28
  page.drawText("Sarah und David Brand", { x: marginL, y, size: 12, font, color: black })

  page.drawLine({ start: { x: 48, y: 82 }, end: { x: 548, y: 82 }, thickness: 3, color: blue })
  drawLines(page, [u.name, u.strasse, `${u.plz} ${u.ort}`, u.inhaber], 60, 70, { font, size: 8, color: black, lineHeight: 10 })
  drawLines(page, [u.telefon, u.email], 195, 60, { font, size: 8, color: black, lineHeight: 10 })
  drawLines(page, [u.bank, u.iban, `BIC: ${u.bic}`], 330, 70, { font, size: 8, color: black, lineHeight: 10 })
  drawLines(page, ["Steuernr.", u.steuernummer], 468, 70, { font, size: 8, color: black, lineHeight: 10 })

  const pdfBytes = await pdfDoc.save()
  downloadDatei(pdfBytes, `pdf-beleg-${d.rechnung || "rechnung"}.pdf`, "application/pdf")
  setServerStatus("PDF-Beleg wurde erstellt.", "success")
  }catch(error){
  setServerStatus(error.message || "PDF-Beleg konnte nicht erstellt werden.", "error")
  }finally{
  if(button){
    button.disabled = false
  }
  }
}

function erstelleXRechnungXML(){
  const d = sammleRechnungsDaten()
  const u = d.unternehmen
  const lines = d.positionen.map((p, idx) => `
<cac:InvoiceLine>
  <cbc:ID>${idx + 1}</cbc:ID>
  <cbc:InvoicedQuantity unitCode="C62">${p.anzahl || 1}</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="EUR">${p.summe.toFixed(2)}</cbc:LineExtensionAmount>
  <cac:Item><cbc:Name>${esc(p.beschreibung)}</cbc:Name></cac:Item>
  <cac:Price><cbc:PriceAmount currencyID="EUR">${(p.preis || p.summe).toFixed(2)}</cbc:PriceAmount></cac:Price>
</cac:InvoiceLine>`).join("\n")
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(d.rechnung)}</cbc:ID>
  <cbc:IssueDate>${formatISO(d.datum)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>${esc(u.name)}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${esc(u.strasse)}</cbc:StreetName><cbc:CityName>${esc(u.ort)}</cbc:CityName><cbc:PostalZone>${esc(u.plz)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>${esc(u.steuernummer)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:Contact><cbc:Name>${esc(u.inhaber)}</cbc:Name><cbc:Telephone>${esc(u.telefon)}</cbc:Telephone><cbc:ElectronicMail>${esc(u.email)}</cbc:ElectronicMail></cac:Contact></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>${esc(d.name)}</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${esc(u.iban.replaceAll(" ", ""))}</cbc:ID><cbc:Name>${esc(u.bank)}</cbc:Name><cac:FinancialInstitutionBranch><cbc:ID>${esc(u.bic)}</cbc:ID></cac:FinancialInstitutionBranch></cac:PayeeFinancialAccount></cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${d.mwst.toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">${d.netto.toFixed(2)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${d.gesamt.toFixed(2)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${d.gesamt.toFixed(2)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`
  downloadDatei(xml, `xrechnung-${d.rechnung || "rechnung"}.xml`, "application/xml")
}

window.onload = function(){
  nachtHinzufuegen()
  pruefeSupabaseStatus({ auto: true })
}
