/*
 * Decodes the data written by the centralina in the NFC tag link
 * (https://<page>#v=1&t=..&b=..) and renders it. See Core/App/nfc_tag.h.
 * Also loaded by tests/host/test_web.js under Node.
 */
(function (root) {
  "use strict";

  var TZ = "Europe/Rome";

  function num(params, key) {
    var v = params.get(key);
    if (v === null || v === "" || !/^-?\d+$/.test(v)) return null;
    return parseInt(v, 10);
  }

  /* fragment string ("v=1&t=...") -> data object, or null if it is not a centralina link */
  function parse(fragment) {
    var params = new URLSearchParams((fragment || "").replace(/^#/, ""));
    if (num(params, "v") !== 1) return null;
    var z = num(params, "z") || 0;
    return {
      updated: num(params, "t"),            // unix s, null if the centralina clock is not set
      battMv: num(params, "b"),
      battOver: (z & 1) !== 0,
      panelMv: num(params, "p"),
      panelOver: (z & 2) !== 0,
      vddaMv: num(params, "a"),             // MCU supply = ADC reference, null on older firmware
      tempDc: num(params, "c"),             // tenths of C, null if no NTC
      rainRaw: num(params, "w"),            // rain sensor raw reading (0..4095), null on older firmware
      raining: num(params, "y") === 1,
      rainLong: num(params, "q"),           // diagnostics, see nfc_tag.h
      rainSelLow: num(params, "k"),
      rainSelHigh: num(params, "h"),
      valveOpen: num(params, "o") === 1,
      minutesLeft: num(params, "r"),
      activations: num(params, "n") || 0,
      lastStart: num(params, "l"),
      lastMinutes: num(params, "d"),
      totalMinutes: num(params, "s") || 0
    };
  }

  function fmtDate(unix) {
    var d = new Date(unix * 1000);
    return d.toLocaleString("it-IT", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
                                       hour: "2-digit", minute: "2-digit" });
  }

  function fmtVolt(mv, over) {
    if (mv === null) return "-";
    return (over ? "> " : "") + (mv / 1000).toFixed(2).replace(".", ",") + " V";
  }

  function fmtMinutes(min) {
    if (min === null) return "-";
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  function fmtAge(unix, nowMs) {
    var s = Math.round(nowMs / 1000 - unix);
    if (s < 90) return "adesso";
    if (s < 3600) return Math.round(s / 60) + " minuti fa";
    if (s < 172800) return Math.round(s / 3600) + " ore fa";
    return Math.round(s / 86400) + " giorni fa";
  }

  /* data -> list of rows {label, value, note, level} for the view */
  function rows(d, nowMs) {
    var out = [];
    out.push({ label: "Aggiornato",
               value: d.updated ? fmtDate(d.updated) : "ora non impostata",
               note: d.updated ? fmtAge(d.updated, nowMs) : "scrivi un messaggio alla centralina per impostarla" });
    out.push({ label: "Batteria", value: fmtVolt(d.battMv, d.battOver),
               note: d.battOver ? "oltre il fondo scala della misura" : (d.battMv !== null && d.battMv < 3600 ? "bassa" : ""),
               level: d.battMv !== null && d.battMv < 3600 && !d.battOver ? "warn" : "" });
    out.push({ label: "Pannello", value: fmtVolt(d.panelMv, d.panelOver), note: "" });
    if (d.vddaMv !== null) {
      var vddOk = d.vddaMv >= 2700 && d.vddaMv <= 2900;
      out.push({ label: "Alimentazione interna", value: fmtVolt(d.vddaMv, false),
                 note: vddOk ? "" : "attesa 2,80 V (LDO)", level: vddOk ? "" : "warn" });
    }
    out.push({ label: "Temperatura",
               value: d.tempDc === null ? "non disponibile" : (d.tempDc / 10).toFixed(1).replace(".", ",") + " °C",
               note: "" });
    if (d.rainRaw !== null) {
      out.push({ label: "Pioggia", value: d.raining ? "bagnato" : "asciutto",
                 note: "lettura sensore " + d.rainRaw, level: d.raining ? "on" : "" });
    }
    if (d.rainLong !== null && d.rainSelLow !== null && d.rainSelHigh !== null) {
      out.push({ label: "Pioggia diagnostica", value: "x10: " + d.rainLong,
                 note: "commutatore basso " + d.rainSelLow + " / alto " + d.rainSelHigh });
    }
    out.push({ label: "Valvola", value: d.valveOpen ? "aperta" : "chiusa",
               note: d.valveOpen && d.minutesLeft !== null ? "si chiude tra " + fmtMinutes(d.minutesLeft) : "",
               level: d.valveOpen ? "on" : "" });
    out.push({ label: "Attivazioni", value: String(d.activations), note: "" });
    out.push({ label: "Ultima irrigazione",
               value: d.activations === 0 ? "-" : (d.lastStart ? fmtDate(d.lastStart) : "ora sconosciuta"),
               note: d.activations === 0 || d.lastMinutes === null ? "" :
                     (d.valveOpen ? "in corso" : "durata " + fmtMinutes(d.lastMinutes)) });
    out.push({ label: "Totale irrigato", value: fmtMinutes(d.totalMinutes), note: "" });
    return out;
  }

  var api = { parse: parse, rows: rows, fmtMinutes: fmtMinutes, fmtVolt: fmtVolt, fmtDate: fmtDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Centralina = api;
})(this);
