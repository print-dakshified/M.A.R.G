
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, SquarePen, Globe, FileText, FolderCheck,
  Languages, MousePointerClick, ArrowUp, ChevronDown,
  ShieldCheck, User, Mic, MicOff, Volume2, VolumeX
} from "lucide-react";
import { createSpeechRecognition, getSpeechLanguage, speakText, stopSpeaking } from "./extension/src/voice";
import "./App.css";

const API_URL = "http://127.0.0.1:8000/api/chat";

const languages = [
  "Auto detect", "English", "Hindi", "Kannada", "Tamil",
  "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati",
  "Punjabi", "Odia", "Urdu", "Assamese", "Sanskrit",
  "Spanish", "French", "German", "Arabic", "Chinese",
  "Japanese", "Korean", "Portuguese", "Russian"
];

const cards = [
  {
    icon: FileText,
    title: "Understand a form",
    subtitle: "Simplify difficult questions",
    prompt: "Help me understand a government form."
  },
  {
    icon: FolderCheck,
    title: "Documents needed",
    subtitle: "Know what to keep ready",
    prompt: "Tell me which documents I need for my government application."
  },
  {
    icon: Languages,
    title: "Translate a question",
    subtitle: "Understand any language",
    prompt: "Help me translate and explain a government form question."
  },
  {
    icon: MousePointerClick,
    title: "Explain page text",
    subtitle: "Understand selected text",
    selected: true
  }
];

const examples = [
  "What documents are needed for a PAN card?",
  "What does annual family income mean?",
  "How do I apply for a driving licence?"
];

export default function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [language, setLanguage] = useState("Auto detect");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
      stopSpeaking();
    };
  }, []);

  function toggleListening() {
    setError("");

    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setListening(false);
      return;
    }

    const recognition = createSpeechRecognition();

    if (!recognition) {
      setError("Voice input is not supported in this Chrome version. Please type your message instead.");
      return;
    }

    recognition.lang = getSpeechLanguage(language);
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) setMessage(transcript.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow microphone access for M.A.R.G. in Chrome site settings.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("Voice input error: " + event.error + ". You can still type your question.");
      }
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setListening(false);
      setError("Could not start the microphone. Please try again.");
    }
  }

  function toggleAutoSpeak() {
    setAutoSpeak(current => {
      if (current) stopSpeaking();
      return !current;
    });
  }

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  function newChat() {
    setMessages([]);
    setMessage("");
    setError("");
    setLoading(false);
  }

  async function explainSelectedText() {
    setError("");

    if (typeof chrome === "undefined" || !chrome.tabs) {
      setError("Open M.A.R.G. in Chrome to use this feature.");
      return;
    }

    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tabs[0]?.id) {
        setError("No active webpage found.");
        return;
      }

      const result = await chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GET_SELECTED_TEXT" }
      );

      if (!result?.selectedText?.trim()) {
        setError("Select some text on the webpage first.");
        return;
      }

      setMessage(
        "Explain this government form text in simple language:\n\n" +
        result.selectedText
      );

      inputRef.current?.focus();
    } catch {
      setError("This webpage does not allow text access. Try another page.");
    }
  }
async function understandPage() {
  setError("");

  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tabs[0]?.id) {
      setError("No active webpage found.");
      return;
    }

    let page;

try {
  page = await chrome.tabs.sendMessage(
    tabs[0].id,
    { type: "GET_PAGE_CONTENT" }
  );
} catch (error) {
  await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    files: ["content.js"]
  });

  page = await chrome.tabs.sendMessage(
    tabs[0].id,
    { type: "GET_PAGE_CONTENT" }
  );
}

    if (!page?.success) {
      setError(page?.error || "Could not read this page.");
      return;
    }

    if (!page.pageText && !page.fields?.length) {
      setError("No readable form content found on this page.");
      return;
    }

    const prompt = `
Help me understand the government form currently open in my browser.

Explain it in very simple language.

1. What is this page for?
2. Explain each visible form field in order.
3. Tell me what information I should prepare for each field.
4. Explain difficult words and instructions.
5. Identify any documents I may need.
6. Tell me what I should do next.

Do not fill or submit anything.
Do not guess missing information or invent official requirements.

PAGE TITLE:
${page.pageTitle}

VISIBLE FORM FIELDS:
${page.fields.join("\n\n")}

VISIBLE PAGE TEXT:
${page.pageText}
`;

    sendMessage("Explain the form on my current webpage.", prompt);

  } catch (error) {
  console.error("MARG PAGE ERROR:", error);

  setError(
    "Page access error: " + error.message
  );
}
}
  async function sendMessage(value = message, apiMessage = value) {
  const text = value.trim();
  const requestText = apiMessage.trim();

    if (!text || loading) return;

    setError("");
    setMessage("");

    const previousMessages = messages.map(item => ({
      role: item.role,
      text: item.text
    }));

    const updatedMessages = [
      ...messages,
      { role: "user", text }
    ];

    setMessages(updatedMessages);
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: requestText,
          language,
          history: previousMessages.slice(-12)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || `Server error (${response.status})`
        );
      }

      if (!data.reply) {
        throw new Error("Gemini returned an empty response.");
      }

      setMessages(current => [
        ...current,
        { role: "assistant", text: data.reply }
      ]);

      if (autoSpeak) {
        speakText(data.reply, language);
      }
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot reach M.A.R.G. backend. Check that the server is running on port 8000."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  function selectCard(card) {
    if (card.selected) {
      explainSelectedText();
    } else {
      setMessage(card.prompt);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="marg-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={17} />
          </div>
          <div>
            <div className="brand-title">M.A.R.G.</div>
            <div className="brand-subtitle">GOVERNMENT FORM ASSISTANT</div>
          </div>
        </div>

        <button className="icon-button" onClick={newChat} title="New chat">
          <SquarePen size={17} />
        </button>
      </header>

      <main className="main-area">
        {messages.length === 0 ? (
          <section className="home-screen">
            <div className="welcome">
              <h1>Let's get that form done.</h1>
              <p>What do you need help with today?</p>
            </div>

            <div className="card-grid">
              {cards.map(card => {
                const Icon = card.icon;

                return (
                  <button
                    className="feature-card"
                    key={card.title}
                    onClick={() => selectCard(card)}
                  >
                    <span className="feature-icon">
                      <Icon size={19} strokeWidth={1.8} />
                    </span>
                    <strong>{card.title}</strong>
                    <small>{card.subtitle}</small>
                  </button>
                );
              })}
            </div>

            <section className="examples">
              <div className="examples-heading">TRY ASKING</div>
              {examples.map(example => (
                <button
                  className="example-item"
                  key={example}
                  onClick={() => sendMessage(example)}
                >
                  <span>{example}</span>
                  <span className="example-arrow">↗</span>
                </button>
              ))}
            </section>

            <div className="privacy">
              <ShieldCheck size={13} />
              <span>You stay in control of every step.</span>
            </div>
          </section>
        ) : (
          <section className="chat-area" ref={chatRef}>
            <div className="chat-heading">YOUR CONVERSATION</div>

            {messages.map((item, index) => (
              <div className={`chat-row ${item.role}`} key={index}>
                <div className="chat-avatar">
                  {item.role === "assistant"
                    ? <Sparkles size={14} />
                    : <User size={14} />}
                </div>

                <div className="chat-message">
                  <span>{item.role === "assistant" ? "M.A.R.G." : "YOU"}</span>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-row assistant">
                <div className="chat-avatar">
                  <Sparkles size={14} />
                </div>
                <div className="chat-message">
                  <span>M.A.R.G.</span>
                  <p className="typing">Thinking...</p>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="bottom-area">
        {error && <div className="error-message">{error}</div>}

        <div className="toolbar">
  <button
    className={`page-button voice-toggle ${autoSpeak ? "voice-enabled" : ""}`}
    onClick={toggleAutoSpeak}
    title={autoSpeak ? "Turn spoken replies off" : "Turn spoken replies on"}
  >
    {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
    {autoSpeak ? "Voice replies on" : "Voice replies off"}
  </button>

  <button className="page-button" onClick={understandPage}>
    <FileText size={14} />
    Understand page
  </button>

  <button className="page-button" onClick={explainSelectedText}>
            <MousePointerClick size={14} />
            Selected page text
          </button>

          <div className="language-wrap">
            <button
              className="language-button"
              onClick={() => setLanguageOpen(v => !v)}
            >
              <Globe size={14} />
              {language}
              <ChevronDown size={13} />
            </button>

            {languageOpen && (
              <div className="language-menu">
                {languages.map(item => (
                  <button
                    key={item}
                    className={language === item ? "active" : ""}
                    onClick={() => {
                      setLanguage(item);
                      setLanguageOpen(false);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {listening && (
          <div className="voice-status" role="status">
            <span className="voice-pulse" />
            Listening... Speak now, then tap the microphone to stop.
          </div>
        )}

        <div className="composer">
          <textarea
            ref={inputRef}
            rows={1}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask M.A.R.G. anything..."
            disabled={loading}
          />

          <button
            className={`mic-button ${listening ? "mic-listening" : ""}`}
            onClick={toggleListening}
            disabled={loading}
            title={listening ? "Stop listening" : "Speak to M.A.R.G."}
            aria-label={listening ? "Stop listening" : "Speak to M.A.R.G."}
          >
            {listening ? <MicOff size={17} /> : <Mic size={17} />}
          </button>

          <button
            className="send-button"
            onClick={() => sendMessage()}
            disabled={!message.trim() || loading}
            aria-label="Send"
          >
            <ArrowUp size={18} />
          </button>
        </div>

        <div className="bottom-note">
          AI can make mistakes. Verify important details with official sources.
        </div>
      </footer>
    </div>
  );
}
