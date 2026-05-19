# Billkill Rechnungsapp: Supabase + serverseitiges PDF

## Zielbild

Die PWA bleibt schlank. Sie sammelt nur die Rechnungsdaten und schickt sie an `/.netlify/functions/create-invoice`. Die Server-Funktion vergibt die Rechnungsnummer in Supabase, erzeugt das PDF mit pdfmake, bettet die ZUGFeRD-XML als Anlage ein und liefert das PDF als Download zurueck.

## Einmalige Einrichtung

1. Supabase-Projekt anlegen.
2. Im Supabase SQL Editor den Inhalt von `supabase/schema.sql` ausfuehren.
3. Bei Netlify diese Environment Variables setzen:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Abhaengigkeiten installieren:
   - `npm install`
5. Lokal testen:
   - `npm run dev`
6. Danach ueber Netlify deployen.

## Wichtige Regeln

- Der `SUPABASE_SERVICE_ROLE_KEY` darf niemals in `index.html`, `app.js` oder GitHub Pages stehen. Er gehoert nur in Netlify Environment Variables.
- Die verbindliche Rechnungsnummer entsteht erst in der Server-Funktion.
- Wenn eine PDF-Erstellung nach Nummernvergabe scheitert, bleibt ein Datensatz mit Status `failed` erhalten. Nicht loeschen, sondern dokumentieren.
- Die erzeugte ZUGFeRD-Datei sollte vor produktiver Nutzung mit einem Validator geprueft werden. Die aktuelle Umsetzung bettet XML ein, ersetzt aber keine fachliche Steuer-/E-Rechnungspruefung.
- Fuer eine optische 1:1-Nachbildung der ODT-Referenz sollten echte CI-Schriften als Server-Fonts eingebunden werden. Aktuell nutzt der Server Helvetica als stabile Standardschrift.

## Naechste fachliche Pruefpunkte

- Rechnungsnummernformat bestaetigen, aktuell `YYYY-0001`.
- Kulturfoerderabgabe und Umsatzsteuerlogik steuerlich pruefen.
- ZUGFeRD-Profil festlegen, aktuell Basic WL.
- PDF/A-3-Konformitaet validieren, falls zwingend erforderlich.
