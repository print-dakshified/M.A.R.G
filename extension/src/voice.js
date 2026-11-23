
const API_BASE_URL = "http://127.0.0.1:8000/api";

const SPEECH_LANGUAGES = {
  "Auto detect": "unknown",
  English: "en-IN",
  Hindi: "hi-IN",
  Kannada: "kn-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Malayalam: "ml-IN",
  Marathi: "mr-IN",
  Bengali: "bn-IN",
  Gujarati: "gu-IN",
  Punjabi: "pa-IN",
  Odia: "od-IN",
  Urdu: "ur-IN",
  Assamese: "as-IN",
  Sanskrit: "sa-IN",
  Konkani: "kok-IN",
  Kashmiri: "ks-IN",
  Nepali: "ne-IN",
  Manipuri: "mni-IN",
  Bodo: "brx-IN",
  Maithili: "mai-IN",
  Dogri: "doi-IN",
  Sindhi: "sd-IN",
  Santali: "sat-IN"
};

const SARVAM_TTS_LANGUAGES = new Set([
  "en-IN", "hi-IN", "bn-IN", "gu-IN",
  "kn-IN", "ml-IN", "mr-IN", "od-IN",
  "pa-IN", "ta-IN", "te-IN"
]);

let currentAudio = null;
let currentController = null;
let currentAudioUrl = null;
let playbackVersion = 0;

export function getSpeechLanguage(language) {
  return SPEECH_LANGUAGES[language] || "unknown";
}

function detectLanguageFromText(text) {
  const checks = [
    [/[\u0C80-\u0CFF]/, "kn-IN"],
    [/[\u0B80-\u0BFF]/, "ta-IN"],
    [/[\u0C00-\u0C7F]/, "te-IN"],
    [/[\u0D00-\u0D7F]/, "ml-IN"],
    [/[\u0980-\u09FF]/, "bn-IN"],
    [/[\u0A80-\u0AFF]/, "gu-IN"],
    [/[\u0A00-\u0A7F]/, "pa-IN"],
    [/[\u0B00-\u0B7F]/, "od-IN"],
    [/[\u0600-\u06FF]/, "ur-IN"],
    [/[\u0900-\u097F]/, "hi-IN"]
  ];

  for (const [pattern, code] of checks) {
    if (pattern.test(text)) return code;
  }

  return "en-IN";
}

// --------------------------------------------------
// SARVAM SPEECH RECOGNITION
// --------------------------------------------------

export async function transcribeAudio(
  audioBlob,
  language = "Auto detect"
) {
  if (!audioBlob || !audioBlob.size) {
    throw new Error("No audio recording was provided.");
  }

  const formData = new FormData();

  formData.append("file", audioBlob, "recording.webm");

  const languageCode =
    language === "Auto detect"
      ? "unknown"
      : getSpeechLanguage(language);

  formData.append("language_code", languageCode);

  const response = await fetch(
    `${API_BASE_URL}/transcribe`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail || "Speech recognition failed."
    );
  }

  return {
    transcript: data.transcript || "",
    languageCode: data.language_code || languageCode,
    confidence: data.language_probability ?? null
  };
}

// --------------------------------------------------
// OPTIONAL BROWSER RECOGNITION FALLBACK
// --------------------------------------------------

export function createSpeechRecognition() {
  if (typeof window === "undefined") return null;

  const Recognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  return Recognition ? new Recognition() : null;
}

// --------------------------------------------------
// STOP AUDIO
// --------------------------------------------------

export function stopSpeaking() {
  playbackVersion++;

  if (currentController) {
    currentController.abort();
    currentController = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.removeAttribute("src");
    currentAudio.load();
    currentAudio = null;
  }

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// --------------------------------------------------
// REQUEST SPEECH
// --------------------------------------------------

async function requestSpeech(
  text,
  languageCode,
  provider,
  signal
) {
  const response = await fetch(`${API_BASE_URL}/speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      language_code: languageCode,
      provider
    }),
    signal
  });

  if (!response.ok) {
    throw new Error(
      `${provider} failed: ${await response.text()}`
    );
  }

  return response.blob();
}

// --------------------------------------------------
// PLAY AUDIO
// --------------------------------------------------

async function playAudio(blob, version) {
  if (version !== playbackVersion) return false;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  currentAudio = audio;
  currentAudioUrl = url;

  return new Promise((resolve, reject) => {
    let finished = false;

    function cleanup() {
      if (finished) return;
      finished = true;

      audio.onended = null;
      audio.onerror = null;

      if (currentAudio === audio) currentAudio = null;

      if (currentAudioUrl === url) {
        currentAudioUrl = null;
        URL.revokeObjectURL(url);
      }
    }

    audio.onended = () => {
      cleanup();
      resolve(true);
    };

    audio.onerror = () => {
      cleanup();
      reject(new Error("Audio playback failed."));
    };

    audio.play().catch(error => {
      cleanup();
      reject(error);
    });
  });
}

// --------------------------------------------------
// BROWSER SPEECH FALLBACK
// --------------------------------------------------

function browserSpeech(text, languageCode) {
  if (!window.speechSynthesis) return false;

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = languageCode;
  utterance.rate = 0.92;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);

  return true;
}

// --------------------------------------------------
// MAIN SPEECH FUNCTION
// --------------------------------------------------

export async function speakText(
  text,
  language = "Auto detect"
) {
  if (!text?.trim()) return false;

  stopSpeaking();

  const version = playbackVersion;
  const controller = new AbortController();

  currentController = controller;

  const languageCode =
    language === "Auto detect"
      ? detectLanguageFromText(text)
      : getSpeechLanguage(language);

  try {
    // 1. Sarvam first for supported Indian languages

    if (SARVAM_TTS_LANGUAGES.has(languageCode)) {
      try {
        const blob = await requestSpeech(
          text,
          languageCode,
          "sarvam",
          controller.signal
        );

        if (version !== playbackVersion) return false;

        return await playAudio(blob, version);

      } catch (error) {
        if (
          controller.signal.aborted ||
          version !== playbackVersion
        ) return false;

        console.warn("Sarvam TTS failed:", error);
      }
    }

    // 2. ElevenLabs fallback

    try {
      const blob = await requestSpeech(
        text,
        languageCode,
        "elevenlabs",
        controller.signal
      );

      if (version !== playbackVersion) return false;

      return await playAudio(blob, version);

    } catch (error) {
      if (
        controller.signal.aborted ||
        version !== playbackVersion
      ) return false;

      console.warn("ElevenLabs TTS failed:", error);
    }

    // 3. Browser fallback

    if (version !== playbackVersion) return false;

    return browserSpeech(text, languageCode);

  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("MARG voice error:", error);
    }

    return false;

  } finally {
    if (currentController === controller) {
      currentController = null;
    }
  }
}
