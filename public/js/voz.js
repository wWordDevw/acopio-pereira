export function canSpeak() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function unirDictado(finals, interim) {
  return [...finals, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function aplicarResultados(finals, results, resultIndex) {
  let interim = "";
  const start = Number.isInteger(resultIndex) && resultIndex > 0 ? resultIndex : 0;
  for (let i = start; i < results.length; i += 1) {
    const piece = results[i] && results[i][0] && results[i][0].transcript;
    if (!piece) continue;
    const text = String(piece).trim();
    if (!text) continue;
    if (results[i].isFinal) {
      if (text !== finals[finals.length - 1]) finals.push(text);
    } else {
      interim = interim ? `${interim} ${text}` : text;
    }
  }
  return { finals, interim };
}

export function entregarUnaVez(fn) {
  let done = false;
  return (value) => {
    if (done) return;
    done = true;
    if (fn) fn(value);
  };
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
  const ready = entregarUnaVez(onReady);

  function joined() {
    return unirDictado(finals, interim);
  }

  function bind(instance) {
    instance.lang = "es-CO";
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (ev) => {
      const next = aplicarResultados(finals, ev.results, ev.resultIndex);
      interim = next.interim;
      if (onPartial) onPartial(joined());
    };
    instance.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (onError) onError(ev.error);
    };
    instance.onend = () => {
      if (stopped) {
        ready(joined());
        return;
      }
      listen();
    };
  }

  function listen() {
    rec = new Ctor();
    bind(rec);
    try {
      rec.start();
    } catch {
      stopped = true;
      ready(joined());
    }
  }

  function start() {
    stopped = false;
    finals.length = 0;
    interim = "";
    listen();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      if (rec) rec.stop();
    } catch {
      ready(joined());
    }
  }

  return { start, stop };
}
