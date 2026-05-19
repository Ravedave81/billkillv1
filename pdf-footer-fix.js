function drawPdfFooterIcons(page, font, bold, blue, black){
  const footerLineY = 82
  const centers = [152, 296, 440]
  page.drawLine({ start: { x: 48, y: footerLineY }, end: { x: 548, y: footerLineY }, thickness: 3, color: blue })

  centers.forEach((cx) => {
    page.drawCircle({ x: cx, y: footerLineY + 17, size: 14, borderColor: blue, borderWidth: 1.2 })
  })

  const y = footerLineY + 17
  const houseX = centers[0]
  page.drawLine({ start: { x: houseX - 7, y: y + 1 }, end: { x: houseX, y: y + 8 }, thickness: 1.2, color: blue })
  page.drawLine({ start: { x: houseX, y: y + 8 }, end: { x: houseX + 7, y: y + 1 }, thickness: 1.2, color: blue })
  page.drawRectangle({ x: houseX - 5, y: y - 6, width: 10, height: 8, borderColor: blue, borderWidth: 1 })
  page.drawRectangle({ x: houseX - 2, y: y - 6, width: 4, height: 5, borderColor: blue, borderWidth: 0.8 })

  const listX = centers[1]
  page.drawRectangle({ x: listX - 7, y: y - 7, width: 14, height: 14, borderColor: blue, borderWidth: 1.1 })
  page.drawRectangle({ x: listX - 5, y: y + 2, width: 3, height: 3, borderColor: blue, borderWidth: 0.8 })
  page.drawLine({ start: { x: listX, y: y + 5 }, end: { x: listX + 5, y: y + 5 }, thickness: 0.9, color: blue })
  page.drawLine({ start: { x: listX, y: y + 2 }, end: { x: listX + 5, y: y + 2 }, thickness: 0.9, color: blue })
  page.drawLine({ start: { x: listX - 5, y: y - 2 }, end: { x: listX + 5, y: y - 2 }, thickness: 0.9, color: blue })
  page.drawLine({ start: { x: listX - 5, y: y - 5 }, end: { x: listX + 5, y: y - 5 }, thickness: 0.9, color: blue })

  const moneyX = centers[2]
  page.drawCircle({ x: moneyX, y, size: 8, borderColor: blue, borderWidth: 1 })
  page.drawText("$", { x: moneyX - 3, y: y - 4, size: 10, font: bold, color: blue })
}

window.erstelleZugferdPDF = async function(){
  if(!window.PDFLib){
    alert("Die PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.")
    return
  }

  berechnen()
  const d = sammleRechnungsDaten()
  const u = d.unternehmen
  const xml = zugferdXMLInhalt()
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(`Rechnung ${d.rechnung || ""}`.trim())
  pdfDoc.setAuthor(u.name)
  pdfDoc.setSubject("ZUGFeRD-Rechnung mit eingebetteter XML")
  pdfDoc.setCreator("Wohnzeit-Köln Rechnungsapp")
  pdfDoc.setProducer("pdf-lib")
  pdfDoc.setKeywords(["ZUGFeRD", "Factur-X", "Rechnung"])

  const page = pdfDoc.addPage([595.28, 841.89])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const black = rgb(0, 0, 0)
  const blue = rgb(0, 0.529, 0.784)
  const grey = rgb(0.831, 0.831, 0.831)
  const white = rgb(1, 1, 1)
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
  page.drawText("Pos.", { x: marginL + 4, y: y + 2, size: 9, font: bold, color: white })
  page.drawText("Beschreibung", { x: marginL + 56, y: y + 2, size: 9, font: bold, color: white })
  page.drawText("Bruttopreis", { x: 380, y: y + 2, size: 9, font: bold, color: white })
  page.drawText("Gesamtpreis", { x: 468, y: y + 2, size: 9, font: bold, color: white })
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
  page.drawText("7 % UST inkl.", { x: 320, y, size: 10, font: bold, color: black })
  page.drawText(formatEUR(d.mwst), { x: 468, y, size: 10, font: bold, color: black })
  y -= 16
  page.drawText("Netto", { x: 320, y, size: 10, font, color: black })
  page.drawText(formatEUR(d.netto), { x: 468, y, size: 10, font, color: black })
  y -= 24
  page.drawRectangle({ x: 316, y: y - 4, width: 223, height: 22, color: blue })
  page.drawText("Gesamtsumme", { x: 320, y: y + 2, size: 11, font: bold, color: white })
  page.drawText(formatEUR(d.gesamt), { x: 446, y: y + 2, size: 11, font: bold, color: white })

  y -= 40
  page.drawText("Zahlungsbedingungen: Zahlung per sofort und ohne Abzüge.", { x: marginL, y, size: 9, font, color: black })
  y -= 66
  page.drawText("Bei Rückfragen stehen wir selbstverständlich jederzeit gerne zur Verfügung.", { x: marginL, y, size: 12, font, color: black })
  y -= 28
  page.drawText("Mit freundlichen Grüßen", { x: marginL, y, size: 12, font, color: black })
  y -= 28
  page.drawText("Sarah und David Brand", { x: marginL, y, size: 12, font, color: black })

  drawPdfFooterIcons(page, font, bold, blue, black)
  drawLines(page, [u.name, u.strasse, `${u.plz} ${u.ort}`, u.inhaber], 60, 66, { font, size: 8, color: black, lineHeight: 10 })
  drawLines(page, [u.telefon, u.email], 195, 56, { font, size: 8, color: black, lineHeight: 10 })
  drawLines(page, [u.bank, u.iban, `BIC: ${u.bic}`], 330, 66, { font, size: 8, color: black, lineHeight: 10 })
  drawLines(page, ["Steuernr.", u.steuernummer], 468, 66, { font, size: 8, color: black, lineHeight: 10 })

  await pdfDoc.attach(new TextEncoder().encode(xml), "factur-x.xml", {
    mimeType: "application/xml",
    description: "ZUGFeRD Rechnungsdaten",
    creationDate: new Date(),
    modificationDate: new Date()
  })

  const pdfBytes = await pdfDoc.save()
  downloadDatei(pdfBytes, `zugferd-${d.rechnung || "rechnung"}.pdf`, "application/pdf")
}
