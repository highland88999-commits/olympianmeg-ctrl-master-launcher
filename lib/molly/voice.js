// lib/molly/voice.js — Molly's voice in the browser.
//
// She speaks with the device's own speech engine (window.speechSynthesis):
// no network, no keys, no audio uploads, nothing sent anywhere. The voice
// is the phone or computer's built-in English voice — on iPhones that is
// usually Samantha. Listening is NOT included: microphone speech
// recognition is unreliable in iPhone Safari, so typing stays the way in.
//
// One rule: speaking never overrides her governance. Frozen or not, the
// talk box text is what she says; this only reads it aloud.
export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
  const preferred = english.find((v) => /samantha|zira|aria|jenny|female/i.test(v.name));
  return preferred || english[0] || voices[0] || null;
}

export function speakMolly(text) {
  if (!speechSupported() || !text) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopMollySpeech() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
