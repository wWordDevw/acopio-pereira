export function canSpeak() {
  return (
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function listenOnce() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    return Promise.reject(Object.assign(new Error("sin_voz"), { code: "sin_voz" }));
  }
  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = "es-CO";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const text = ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
      resolve(String(text || "").trim());
    };
    rec.onerror = (ev) => {
      reject(Object.assign(new Error(ev.error || "voz_error"), { code: "voz_error" }));
    };
    rec.onend = () => {};
    try {
      rec.start();
    } catch (err) {
      reject(err);
    }
  });
}
