export function canSpeak() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function createDictado({ onPartial, onReady, onError }) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    throw Object.assign(new Error("sin_voz"), { code: "sin_voz" });
  }

  let rec = null;
  let stopped = true;
  const finals = [];
  let interim = "";

  function joined() {
    return [...finals, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function start() {
    stopped = false;
    finals.length = 0;
    interim = "";
    rec = new Ctor();
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0] && ev.results[i][0].transcript;
        if (!piece) continue;
        if (ev.results[i].isFinal) finals.push(String(piece).trim());
        else interim = String(piece).trim();
      }
      if (onPartial) onPartial(joined());
    };
    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (onError) onError(ev.error);
    };
    rec.onend = () => {
      if (stopped) {
        if (onReady) onReady(joined());
        return;
      }
      try {
        rec.start();
      } catch {
        stopped = true;
        if (onReady) onReady(joined());
      }
    };
    rec.start();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      if (rec) rec.stop();
    } catch {
      if (onReady) onReady(joined());
    }
  }

  return { start, stop };
}
