// EAN-Scanner – Machbarkeitstest für eine Telegram Mini App (KitchenGuard).
// Erfasst Barcodes per Live-Scan oder Foto und schickt sie gesammelt an den Bot
// (Telegram.WebApp.sendData – nur möglich, wenn die App über den Tastatur-Knopf
// des Bots geöffnet wurde).

const ZXING_PONYFILL_URL =
  "https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/es/ponyfill.min.js";
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const SCAN_INTERVAL_MS = 150;
const DUPLICATE_WINDOW_MS = 2500;
const BLACK_FRAME_CHECK_MS = 2500;
const MAX_CODES = 25; // sendData erlaubt höchstens 4096 Byte
const PAYLOAD_VERSION = 1;

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg && tg.platform && tg.platform !== "unknown");
// Über den Menü-Knopf geöffnete Mini Apps bekommen eine query_id; dort ist sendData nicht möglich.
const canSendToChat = inTelegram && !tg.initDataUnsafe?.query_id;
if (tg) {
  tg.ready();
  tg.expand();
}

const $ = (id) => document.getElementById(id);
const video = $("video");
const viewport = $("viewport");
const statusEl = $("status");
const btnStart = $("btn-start");
const btnStop = $("btn-stop");
const photoInput = $("photo-input");
const resultsEl = $("results");
const sendHint = $("send-hint");

const diag = {
  Umgebung: inTelegram ? "Telegram Mini App" : "Browser (nicht in Telegram)",
  "Telegram-Plattform": tg?.platform ?? "–",
  "Telegram-Version": tg?.version ?? "–",
  "Senden an Chat": canSendToChat
    ? "möglich (Tastatur-Knopf)"
    : inTelegram ? "nicht möglich (über Menü-Knopf geöffnet)" : "nicht möglich (nicht in Telegram)",
  "Kamera-API (getUserMedia)": navigator.mediaDevices?.getUserMedia ? "vorhanden" : "fehlt",
  "Nativer BarcodeDetector": "BarcodeDetector" in window ? "vorhanden" : "fehlt",
  Erkennung: "wird geladen …",
  Kamerabild: "–",
  "User-Agent": navigator.userAgent,
};
const logLines = [];
const results = [];

let detector = null;
let stream = null;
let scanning = false;
let scanStartedAt = 0;
let lastHit = { code: null, at: 0 };
let nextResultId = 1;

// ---------- Diagnose ----------

function renderDiag() {
  const dl = $("diag");
  dl.replaceChildren();
  for (const [key, value] of Object.entries(diag)) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
}

function log(message) {
  const time = new Date().toLocaleTimeString("de-DE");
  logLines.push(`${time}  ${message}`);
  $("log").textContent = logLines.join("\n");
}

function setStatus(text, cls = "hint") {
  statusEl.textContent = text;
  statusEl.className = cls;
}

// ---------- Erkennung ----------

async function loadDetector() {
  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes("ean_13")) {
        detector = new window.BarcodeDetector({
          formats: FORMATS.filter((f) => supported.includes(f)),
        });
        return "nativ (BarcodeDetector des Browsers)";
      }
      log(`Nativer BarcodeDetector ohne EAN-13 (unterstützt: ${supported.join(", ") || "nichts"})`);
    } catch (err) {
      log(`Nativer BarcodeDetector nicht nutzbar: ${err.message}`);
    }
  }
  const { BarcodeDetector } = await import(ZXING_PONYFILL_URL);
  detector = new BarcodeDetector({ formats: FORMATS });
  return "ZXing (WebAssembly)";
}

// Prüfziffer nach GTIN-Verfahren (EAN-8, UPC-A, EAN-13). UPC-E wird nicht geprüft.
function checkDigitValid(code, format) {
  if (format === "upc_e" || !/^(\d{8}|\d{12}|\d{13})$/.test(code)) return null;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function handleCode(code, format, way, elapsedMs) {
  const now = Date.now();
  if (code === lastHit.code && now - lastHit.at < DUPLICATE_WINDOW_MS) return;
  lastHit = { code, at: now };

  if (results.length >= MAX_CODES) {
    setStatus(`Höchstens ${MAX_CODES} Codes pro Sendung. Bitte erst senden.`, "warn");
    return;
  }

  const valid = checkDigitValid(code, format);
  results.unshift({ id: nextResultId++, code, format, way, elapsedMs, valid, at: new Date() });
  renderResults();
  log(`Erkannt (${way}): ${code} [${format}] nach ${(elapsedMs / 1000).toFixed(1)} s`);

  tg?.HapticFeedback?.notificationOccurred(valid === false ? "warning" : "success");
  viewport.classList.add("hit");
  setTimeout(() => viewport.classList.remove("hit"), 400);
}

function removeResult(id) {
  const index = results.findIndex((r) => r.id === id);
  if (index >= 0) results.splice(index, 1);
  renderResults();
}

function renderResults() {
  resultsEl.replaceChildren();
  if (!results.length) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Noch nichts erkannt.";
    resultsEl.append(li);
  }
  for (const r of results) {
    const li = document.createElement("li");
    li.className = "result";

    const body = document.createElement("div");
    const code = document.createElement("div");
    code.className = "code";
    code.textContent = r.code;

    const check = document.createElement("span");
    if (r.valid === true) { check.className = "ok"; check.textContent = "Prüfziffer ✔"; }
    else if (r.valid === false) { check.className = "bad"; check.textContent = "Prüfziffer ✘"; }
    else { check.className = "warn"; check.textContent = "Prüfziffer nicht geprüft"; }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(
      `${r.format} · ${r.way} · ${(r.elapsedMs / 1000).toFixed(1)} s · ` +
        `${r.at.toLocaleTimeString("de-DE")} · `,
      check,
    );
    body.append(code, meta);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = "Entfernen";
    remove.addEventListener("click", () => removeResult(r.id));

    li.append(body, remove);
    resultsEl.append(li);
  }
  updateSendControls();
}

// ---------- An den Chat senden ----------

function buildPayload() {
  return {
    v: PAYLOAD_VERSION,
    typ: "barcode-scan",
    codes: [...results].reverse().map((r) => ({
      code: r.code,
      format: r.format,
      weg: r.way === "Live-Scan" ? "live" : "foto",
      at: r.at.toISOString(),
    })),
  };
}

function updateSendControls() {
  const n = results.length;
  if (!inTelegram) {
    sendHint.textContent = "Senden geht nur innerhalb von Telegram.";
    return;
  }
  if (!canSendToChat) {
    sendHint.textContent =
      "Diese App wurde über den Menü-Knopf geöffnet. Zum Senden bitte im Chat /start schicken " +
      "und die App über den Knopf „📷 Scannen“ über der Tastatur öffnen.";
    return;
  }
  sendHint.textContent = n
    ? `${n} Code(s) bereit. Unten auf „An Chat senden“ tippen.`
    : "Codes scannen, dann gesammelt an den Chat senden.";
  if (n) {
    tg.MainButton.setText(`${n} Code${n === 1 ? "" : "s"} an Chat senden`);
    tg.MainButton.show();
  } else {
    tg.MainButton.hide();
  }
}

function sendToChat() {
  if (!canSendToChat || !results.length) return;
  const data = JSON.stringify(buildPayload());
  log(`Sende ${results.length} Code(s) an den Bot (${data.length} Byte).`);
  stopLive();
  tg.sendData(data); // schließt die Mini App
}

// ---------- Weg 1: Live-Scan ----------

function frameBrightness() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
  return sum / ((data.length / 4) * 3);
}

function checkForBlackFrame() {
  if (!scanning) return;
  if (!video.videoWidth) {
    diag.Kamerabild = "kein Bild (Videogröße 0)";
    setStatus("Kamera liefert kein Bild. Bitte Weg 2 (Foto) testen.", "bad");
    log("Warnung: Kamera liefert nach 2,5 s keine Bildgröße.");
  } else {
    const brightness = frameBrightness();
    const black = brightness < 4;
    diag.Kamerabild = `${video.videoWidth}×${video.videoHeight}, Helligkeit ${brightness.toFixed(0)}` +
      (black ? " – schwarz?" : "");
    if (black) {
      setStatus("Kamerabild ist schwarz (bekanntes Problem in Telegram unter iOS). Bitte Weg 2 testen.", "bad");
      log("Warnung: Kamerabild schwarz – Live-Scan in dieser Umgebung vermutlich nicht nutzbar.");
    }
  }
  renderDiag();
}

async function scanLoop() {
  if (!scanning) return;
  if (video.readyState >= 2 && video.videoWidth) {
    try {
      const codes = await detector.detect(video);
      for (const c of codes) handleCode(c.rawValue, c.format, "Live-Scan", Date.now() - scanStartedAt);
    } catch (err) {
      log(`Fehler bei der Erkennung: ${err.message}`);
    }
  }
  setTimeout(scanLoop, SCAN_INTERVAL_MS);
}

async function startLive() {
  btnStart.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (err) {
    btnStart.disabled = false;
    setStatus(`Kamera nicht verfügbar: ${err.name}. Bitte Weg 2 (Foto) testen.`, "bad");
    log(`getUserMedia fehlgeschlagen: ${err.name} – ${err.message}`);
    return;
  }

  video.srcObject = stream;
  try {
    await video.play();
  } catch (err) {
    log(`video.play() fehlgeschlagen: ${err.message}`);
  }

  const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  log(`Kamera gestartet (${settings.width ?? "?"}×${settings.height ?? "?"}, ${settings.facingMode ?? "facingMode unbekannt"})`);

  $("idle").hidden = true;
  $("guide").hidden = false;
  btnStop.disabled = false;
  setStatus("Live-Scan läuft. Barcode in den Rahmen halten.", "hint");

  scanning = true;
  scanStartedAt = Date.now();
  lastHit = { code: null, at: 0 };
  setTimeout(checkForBlackFrame, BLACK_FRAME_CHECK_MS);
  scanLoop();
}

function stopLive() {
  if (!scanning && !stream) return;
  scanning = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  $("idle").hidden = false;
  $("guide").hidden = true;
  btnStart.disabled = !detector;
  btnStop.disabled = true;
  setStatus("Kamera gestoppt.", "hint");
}

// ---------- Weg 2: Foto ----------

async function scanPhoto(file) {
  const startedAt = Date.now();
  setStatus("Foto wird ausgewertet …", "hint");
  log(`Foto erhalten: ${file.type || "Typ unbekannt"}, ${(file.size / 1024).toFixed(0)} KB`);
  try {
    const bitmap = await createImageBitmap(file);
    log(`Fotogröße: ${bitmap.width}×${bitmap.height}`);
    const codes = await detector.detect(bitmap);
    bitmap.close?.();
    if (!codes.length) {
      setStatus("Kein Barcode im Foto gefunden. Näher heran, scharf und gerade fotografieren.", "warn");
      log("Foto: kein Barcode gefunden.");
      tg?.HapticFeedback?.notificationOccurred("error");
      return;
    }
    lastHit = { code: null, at: 0 };
    for (const c of codes) handleCode(c.rawValue, c.format, "Foto", Date.now() - startedAt);
    setStatus(`${codes.length} Code(s) im Foto erkannt.`, "ok");
  } catch (err) {
    setStatus(`Foto konnte nicht ausgewertet werden: ${err.message}`, "bad");
    log(`Fehler bei Fotoauswertung: ${err.name} – ${err.message}`);
  }
}

// ---------- Testprotokoll ----------

function buildReport() {
  const lines = ["EAN-Scanner – Testprotokoll", `Zeitpunkt: ${new Date().toLocaleString("de-DE")}`, ""];
  for (const [key, value] of Object.entries(diag)) lines.push(`${key}: ${value}`);
  lines.push("", "Erkannte Codes:");
  if (!results.length) lines.push("  (keine)");
  for (const r of [...results].reverse()) {
    const check = r.valid === true ? "ok" : r.valid === false ? "FALSCH" : "nicht geprüft";
    lines.push(`  ${r.code} [${r.format}] ${r.way}, ${(r.elapsedMs / 1000).toFixed(1)} s, Prüfziffer ${check}`);
  }
  lines.push("", "Log:", ...logLines.map((l) => `  ${l}`));
  return lines.join("\n");
}

async function copyReport() {
  const text = buildReport();
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Testprotokoll in die Zwischenablage kopiert.", "ok");
  } catch {
    const area = $("report-fallback");
    area.value = text;
    area.hidden = false;
    area.focus();
    area.select();
    setStatus("Kopieren nicht erlaubt – Protokoll unten markieren und manuell kopieren.", "warn");
  }
}

// ---------- Start ----------

btnStart.disabled = true;
btnStart.addEventListener("click", startLive);
btnStop.addEventListener("click", stopLive);
$("btn-report").addEventListener("click", copyReport);
photoInput.addEventListener("change", () => {
  const file = photoInput.files?.[0];
  photoInput.value = "";
  if (file && detector) scanPhoto(file);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && scanning) {
    log("App im Hintergrund – Kamera gestoppt.");
    stopLive();
  }
});
if (canSendToChat) tg.MainButton.onClick(sendToChat);

renderDiag();
renderResults();
log(`Gestartet in: ${diag.Umgebung} · Senden an Chat: ${diag["Senden an Chat"]}`);

loadDetector()
  .then((engine) => {
    diag.Erkennung = engine;
    btnStart.disabled = !navigator.mediaDevices?.getUserMedia;
    setStatus(`Bereit · Erkennung: ${engine}`, "ok");
    log(`Erkennung geladen: ${engine}`);
  })
  .catch((err) => {
    diag.Erkennung = `Fehler: ${err.message}`;
    setStatus("Erkennung konnte nicht geladen werden (Netzwerk?). Siehe Diagnose.", "bad");
    log(`Laden der Erkennung fehlgeschlagen: ${err.message}`);
    $("btn-photo").style.opacity = ".45";
  })
  .finally(renderDiag);
