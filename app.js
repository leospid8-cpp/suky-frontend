/* ===================================================
   Suky per Mascia — app.js
   =================================================== */

const BACKEND = "https://ai-mamma.onrender.com";

// ── DOM ──────────────────────────────────────────────
const chat       = document.getElementById("chat");
const textInput  = document.getElementById("text-input");
const btnSend    = document.getElementById("btn-send");
const btnMic     = document.getElementById("btn-mic");
const audioEl    = document.getElementById("audio-player");
const headerBear = document.getElementById("header-bear");

// ── SVG orsetto piccolo (riusato) ────────────────────
const BEAR_SVG = `<svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="6"  cy="7"  r="5" fill="#4a7c59"/>
  <circle cx="24" cy="7"  r="5" fill="#4a7c59"/>
  <circle cx="6"  cy="7"  r="3" fill="#6a9e77"/>
  <circle cx="24" cy="7"  r="3" fill="#6a9e77"/>
  <circle cx="15" cy="17" r="11" fill="#4a7c59"/>
  <ellipse cx="15" cy="21" rx="5.5" ry="3.8" fill="#6a9e77"/>
  <circle cx="11" cy="15" r="1.8" fill="#1e3a2a"/>
  <circle cx="19" cy="15" r="1.8" fill="#1e3a2a"/>
  <circle cx="11.6" cy="14.4" r="0.7" fill="white"/>
  <circle cx="19.6" cy="14.4" r="0.7" fill="white"/>
  <ellipse cx="15" cy="19.5" rx="1.5" ry="1" fill="#1e3a2a"/>
  <path d="M13 22 Q15 24.5 17 22" stroke="#1e3a2a" stroke-width="1" fill="none" stroke-linecap="round"/>
</svg>`;

// ── Stato ────────────────────────────────────────────
let history      = [];
let isWaiting    = false;
let mediaRecorder = null;
let audioChunks  = [];
let isRecording  = false;
let currentSpeakBtn = null;

// ── Init ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  showWelcome();
  autoResizeTextarea();
  registerServiceWorker();
});

function showWelcome() {
  const welcomeText =
    "Ciao Mascia! 🐻🌿 Sono Suky, il tuo assistente verde creato dal tuo figlio con tutto l'amore del mondo! " +
    "Puoi chiedermi qualsiasi cosa: consigli, ricette, curiosità… o semplicemente parlare. " +
    "Tanti auguri di buona Festa della Mamma! 🌸";
  appendBubble("bear", welcomeText);
  history.push({ role: "assistant", content: welcomeText });
}

// ── Invio messaggio ───────────────────────────────────
btnSend.addEventListener("click", () => sendText());

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
});

async function sendText() {
  const text = textInput.value.trim();
  if (!text || isWaiting) return;
  textInput.value = "";
  textInput.style.height = "auto";
  await sendMessage(text);
}

async function sendMessage(userText) {
  isWaiting = true;
  btnSend.disabled = true;

  appendBubble("user", userText);
  history.push({ role: "user", content: userText });

  const typingId = appendTyping();

  try {
    const fullText = await fetchChatStream();
    removeTyping(typingId);
    appendBubble("bear", fullText);
    history.push({ role: "assistant", content: fullText });
  } catch (err) {
    removeTyping(typingId);
    appendBubble("bear", "Ops, ho avuto un problemino! Riprova tra un attimo. 🐾");
    console.error("sendMessage error:", err);
  } finally {
    isWaiting = false;
    btnSend.disabled = false;
  }
}

// ── Streaming chat ────────────────────────────────────
async function fetchChatStream() {
  const res = await fetch(`${BACKEND}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }

  return full.trim();
}

// ── TTS (solo su richiesta dell'utente) ───────────────
async function playTTS(text, speakBtn) {
  // Ferma eventuale riproduzione in corso
  if (currentSpeakBtn && currentSpeakBtn !== speakBtn) {
    currentSpeakBtn.classList.remove("playing");
    window.speechSynthesis?.cancel();
    audioEl.pause();
  }

  // Toggle: se premo di nuovo lo stesso bottone, fermo
  if (currentSpeakBtn === speakBtn) {
    window.speechSynthesis?.cancel();
    audioEl.pause();
    speakBtn.classList.remove("playing");
    currentSpeakBtn = null;
    headerBear.querySelector("svg")?.classList.remove("bear-talking");
    return;
  }

  currentSpeakBtn = speakBtn;
  speakBtn.classList.add("playing");
  headerBear.querySelector("svg")?.classList.add("bear-talking");

  const cleanup = (url) => {
    speakBtn.classList.remove("playing");
    currentSpeakBtn = null;
    headerBear.querySelector("svg")?.classList.remove("bear-talking");
    if (url) URL.revokeObjectURL(url);
  };

  // Prova edge-tts via backend
  let backendOk = false;
  try {
    const res = await fetch(`${BACKEND}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      audioEl.pause();
      audioEl.src = url;
      audioEl.load();
      audioEl.onended = () => cleanup(url);
      audioEl.play().catch(() => { cleanup(url); speakBrowser(text, () => cleanup(null)); });
      backendOk = true;
    }
  } catch (_) {}

  if (!backendOk) {
    speakBrowser(text, () => cleanup(null));
  }
}

async function speakBrowser(text, onEnd) {
  if (!window.speechSynthesis) { onEnd?.(); return; }

  window.speechSynthesis.cancel();

  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    await new Promise((resolve) => {
      window.speechSynthesis.onvoiceschanged = resolve;
      setTimeout(resolve, 1200);
    });
    voices = window.speechSynthesis.getVoices();
  }

  const voice = voices.find(v => v.lang.startsWith("it") && /natural|neural|online/i.test(v.name))
             || voices.find(v => v.lang.startsWith("it") && !v.localService)
             || voices.find(v => v.lang.startsWith("it"))
             || null;

  const utter  = new SpeechSynthesisUtterance(text);
  utter.lang   = "it-IT";
  utter.pitch  = 1.25;
  utter.rate   = 1.0;
  if (voice) utter.voice = voice;

  utter.onend   = () => onEnd?.();
  utter.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utter);
}

// ── Registrazione vocale ──────────────────────────────
btnMic.addEventListener("pointerdown", startRecording);
btnMic.addEventListener("pointerup",   stopRecording);
btnMic.addEventListener("pointerleave", stopRecording);

async function startRecording() {
  if (isRecording || isWaiting) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMime() });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start(100);
    isRecording = true;
    btnMic.classList.add("recording");
    btnMic.title = "Rilascia per inviare";
  } catch (err) {
    alert("Microfono non disponibile. Controlla i permessi.");
    console.error(err);
  }
}

async function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  btnMic.classList.remove("recording");
  btnMic.title = "Tieni premuto per parlare";
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());

  mediaRecorder.onstop = async () => {
    const mime = getSupportedMime();
    const blob = new Blob(audioChunks, { type: mime });
    if (blob.size < 1000) return;
    const text = await transcribeAudio(blob, mime);
    if (text) { textInput.value = text; await sendText(); }
  };
}

async function transcribeAudio(blob, mime) {
  const ext  = mime.includes("ogg") ? "audio.ogg" : "audio.webm";
  const form = new FormData();
  form.append("audio", blob, ext);
  try {
    const res  = await fetch(`${BACKEND}/api/stt`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
    const data = await res.json();
    return data.text || "";
  } catch (err) {
    console.error("Trascrizione fallita:", err);
    return "";
  }
}

function getSupportedMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "audio/webm";
}

// ── UI helpers ────────────────────────────────────────
function appendBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `bubble-wrap ${role}`;

  if (role === "bear") {
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "bubble-avatar";
    avatarDiv.innerHTML = BEAR_SVG;

    const col = document.createElement("div");
    col.className = "bubble-col";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(text);

    const speakBtn = document.createElement("button");
    speakBtn.className = "btn-speak";
    speakBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
    </svg> Riascolta`;
    speakBtn.title = "Ascolta la risposta";
    speakBtn.addEventListener("click", () => playTTS(text, speakBtn));

    col.appendChild(bubble);
    col.appendChild(speakBtn);
    wrap.appendChild(avatarDiv);
    wrap.appendChild(col);
  } else {
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(text);
    wrap.appendChild(bubble);
  }

  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}

function appendTyping() {
  const id   = "typing-" + Date.now();
  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap bear";
  wrap.id = id;

  const avatarDiv = document.createElement("div");
  avatarDiv.className = "bubble-avatar";
  avatarDiv.innerHTML = BEAR_SVG;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;

  wrap.appendChild(avatarDiv);
  wrap.appendChild(bubble);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return id;
}

function removeTyping(id) { document.getElementById(id)?.remove(); }

function autoResizeTextarea() {
  textInput.addEventListener("input", () => {
    textInput.style.height = "auto";
    textInput.style.height = Math.min(textInput.scrollHeight, 100) + "px";
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}
