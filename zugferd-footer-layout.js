const originalDrawLinesForFooterLayout = window.drawLines

function drawCenteredPdfLines(page, lines, centerX, y, options){
  const { font, size, color, lineHeight = size + 4 } = options
  lines.filter(Boolean).forEach((line, index) => {
    const text = String(line)
    const width = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: centerX - width / 2, y: y - index * lineHeight, size, font, color })
  })
}

window.drawLines = function(page, lines, x, y, options){
  const roundedX = Math.round(x)
  const footerCenters = {
    60: 110,
    195: 235,
    330: 370,
    468: 486
  }

  if(y <= 70 && footerCenters[roundedX]){
    drawCenteredPdfLines(page, lines, footerCenters[roundedX], y, options)
    return
  }

  return originalDrawLinesForFooterLayout(page, lines, x, y, options)
}

function drawPdfFooterIcons(page, font, bold, blue, black){
  const footerLineY = 82
  const iconY = 101
  const iconRadius = 16
  const centers = [110, 235, 370]

  page.drawLine({ start: { x: 8, y: footerLineY }, end: { x: 587, y: footerLineY }, thickness: 3, color: blue })

  centers.forEach((cx) => {
    page.drawCircle({ x: cx, y: iconY, size: iconRadius, borderColor: blue, borderWidth: 1.2 })
  })

  const houseX = centers[0]
  page.drawLine({ start: { x: houseX - 8, y: iconY + 1 }, end: { x: houseX, y: iconY + 10 }, thickness: 1.3, color: blue })
  page.drawLine({ start: { x: houseX, y: iconY + 10 }, end: { x: houseX + 8, y: iconY + 1 }, thickness: 1.3, color: blue })
  page.drawRectangle({ x: houseX - 6, y: iconY - 8, width: 12, height: 10, borderColor: blue, borderWidth: 1.2 })
  page.drawRectangle({ x: houseX - 2, y: iconY - 8, width: 4, height: 6, borderColor: blue, borderWidth: 0.9 })

  const listX = centers[1]
  page.drawRectangle({ x: listX - 8, y: iconY - 8, width: 16, height: 16, borderColor: blue, borderWidth: 1.2 })
  page.drawRectangle({ x: listX - 6, y: iconY + 3, width: 3.5, height: 3.5, borderColor: blue, borderWidth: 0.9 })
  page.drawRectangle({ x: listX - 6, y: iconY - 5, width: 3.5, height: 3.5, borderColor: blue, borderWidth: 0.9 })
  page.drawLine({ start: { x: listX, y: iconY + 6 }, end: { x: listX + 6, y: iconY + 6 }, thickness: 1, color: blue })
  page.drawLine({ start: { x: listX, y: iconY + 3 }, end: { x: listX + 6, y: iconY + 3 }, thickness: 1, color: blue })
  page.drawLine({ start: { x: listX, y: iconY - 2 }, end: { x: listX + 6, y: iconY - 2 }, thickness: 1, color: blue })
  page.drawLine({ start: { x: listX, y: iconY - 5 }, end: { x: listX + 6, y: iconY - 5 }, thickness: 1, color: blue })

  const moneyX = centers[2]
  page.drawCircle({ x: moneyX, y: iconY, size: 8.5, borderColor: blue, borderWidth: 1.1 })
  page.drawText("$", { x: moneyX - 3.2, y: iconY - 4.3, size: 10, font: bold, color: blue })
  page.drawLine({ start: { x: moneyX - 14, y: iconY + 11 }, end: { x: moneyX - 8, y: iconY + 16 }, thickness: 1, color: blue })
  page.drawLine({ start: { x: moneyX + 8, y: iconY - 16 }, end: { x: moneyX + 14, y: iconY - 11 }, thickness: 1, color: blue })
}

window.drawPdfFooterIcons = drawPdfFooterIcons
