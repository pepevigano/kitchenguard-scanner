# Prototyp: EAN-Scanner als Telegram Mini App

**Zweck:** Machbarkeitstest zu [konzept/02_eingabekanal.md](../../konzept/02_eingabekanal.md), Abschnitt 5.1. Er soll klären, ob sich EAN-Barcodes innerhalb von Telegram zuverlässig erfassen lassen, und auf welchem der beiden Wege.

Das ist **kein** Teil der späteren Umsetzung, sondern ein Wegwerf-Prototyp für eine einzige Frage.

## Was die App kann

| Weg | Ablauf | Was getestet wird |
| --- | --- | --- |
| 1 · Live-Scan | Kamerabild in der App, der Code wird laufend erkannt | Funktioniert der Kamerazugriff innerhalb von Telegram? Wie schnell wird erkannt? |
| 2 · Foto aufnehmen | Die normale Handykamera öffnet sich, der Code wird aus dem Foto gelesen | Die robustere Rückfallebene |

Außerdem:
- **Prüfziffernkontrolle** für EAN-13, EAN-8 und UPC-A. Das ist ein Vorgeschmack auf die Stufe „Prüfen“ aus Anf. §4.
- **Diagnose:** Umgebung, Telegram-Plattform und -Version, verwendete Erkennung (eingebaut im Browser oder ZXing/WebAssembly), Kameraauflösung und eine Warnung, wenn das Kamerabild schwarz bleibt.
- **Testprotokoll kopieren:** fasst Diagnose, Ergebnisse und Log als Text zusammen, zum Einfügen in die Tabelle unten.

Technik: eine statische Web-Seite (`index.html` und `app.js`) ohne Build-Schritt und ohne Server-Logik. Die Erkennung kommt aus der Bibliothek [`barcode-detector`](https://www.npmjs.com/package/barcode-detector) 3.2.2 (ZXing als WebAssembly) über jsDelivr. Wenn der Browser selbst EAN-Codes erkennen kann, wird stattdessen seine eingebaute Erkennung genutzt.

## Ausprobieren

Eine Mini App muss über **HTTPS** erreichbar sein. Lokal per `file://` öffnen funktioniert nicht, weil der Kamerazugriff dann gesperrt ist.

### Schritt 1 · Seite veröffentlichen

**Variante A: GitHub Pages** (dauerhaft, kostenlos)
1. Auf GitHub ein neues öffentliches Repository anlegen, z. B. `kitchenguard-scanner`.
2. `index.html` und `app.js` hochladen, entweder über „Add file → Upload files“ im Browser oder per Git.
3. Im Repository: Settings → Pages → Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
4. Nach etwa einer Minute ist die Seite erreichbar unter `https://<github-name>.github.io/kitchenguard-scanner/`.

**Variante B: Netlify Drop** (schnell, für einen kurzen Test)
1. <https://app.netlify.com/drop> öffnen und den Ordner `ean-scanner` hineinziehen.
2. Die angezeigte `https://….netlify.app`-Adresse verwenden. Ohne Netlify-Konto wird die Seite nach kurzer Zeit wieder gelöscht.

**Zwischentest:** Die Adresse zuerst im normalen Handy-Browser öffnen (Safari bzw. Chrome). So lässt sich später unterscheiden, ob ein Problem an Telegram liegt oder am Gerät.

### Schritt 2 · Telegram-Bot anlegen und App einhängen

1. In Telegram mit **@BotFather** schreiben und `/newbot` schicken. Einen Namen und einen Benutzernamen vergeben, der auf `bot` endet. Den Token nicht weitergeben. Für diesen Test wird er nicht gebraucht.
2. `/mybots` → den Bot wählen → **Bot Settings** → **Menu Button** → **Configure menu button**.
3. Die HTTPS-Adresse aus Schritt 1 schicken und als Titel z. B. `Scanner` angeben.
4. Den Chat mit dem eigenen Bot öffnen. Unten links neben dem Eingabefeld erscheint der Knopf **Scanner** und öffnet die App.

> Die Menüpunkte bei BotFather können je nach Version leicht anders heißen. Gesucht ist der Punkt, an dem man den Menü-Knopf mit einer Web-Adresse verbindet.

**Nach Änderungen an der Seite** speichert Telegram manchmal die alte Version zwischen. Dann die App schließen und neu öffnen, oder an die Adresse in BotFather `?v=2` anhängen.

## Testplan

Jede Kombination einmal durchgehen:

1. Weg 1: Kamera starten und 3 verschiedene Produkte scannen.
2. Weg 2: 3 Produkte fotografieren.
3. Einmal absichtlich ein unscharfes Foto aufnehmen. Erwartet wird: „Kein Barcode gefunden“, kein falscher Code.
4. „Testprotokoll kopieren“ antippen und die Ergebnisse unten eintragen.

Testumgebungen, nach Wichtigkeit:

1. iPhone in Telegram
2. Android in Telegram
3. iPhone in Safari (zum Vergleich)
4. Android in Chrome (zum Vergleich)
5. optional: Telegram Desktop

## Testprotokoll

| Datum | Gerät / Betriebssystem | Umgebung | Erkennung (Diagnose) | Live-Scan funktioniert? | Zeit bis zur Erkennung | Foto funktioniert? | Bemerkungen |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |

## Bekannte Risiken, die der Test prüfen soll

- **iOS in Telegram:** Das Kamerabild kann schwarz bleiben. Die App erkennt das nach etwa 2,5 Sekunden und weist auf Weg 2 hin.
- **Android in Telegram:** Die Kamera startet teils erst nach einer Berührung. Deshalb startet sie in dieser App grundsätzlich erst per Knopf.
- **iOS:** Die Kamera-Erlaubnis wird bei jedem Öffnen erneut abgefragt.
- **Erster Start:** Die Erkennungsbibliothek (WebAssembly, rund 1 MB) wird beim Öffnen vom CDN geladen. Ohne Netz geht nichts.
