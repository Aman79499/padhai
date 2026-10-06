/*************************************************************
 * PADHAI – Punjabi voice generator (standalone Apps Script)
 * Makes one MP3 clip for every Punjabi word/sentence the app
 * speaks, using Google Cloud Text-to-Speech (pa-IN voice),
 * and packs them into 16 files: b_0.json … b_f.json
 * Upload those 16 files to GitHub in the folder  audio/pa/
 *************************************************************/

// ===== SETTINGS (edit these) =====
const API_KEY       = 'PASTE_YOUR_API_KEY_HERE';
const VOICE_NAME    = 'pa-IN-Wavenet-A';   // other options: pa-IN-Wavenet-B / C / D, pa-IN-Standard-A / B / C / D
const SPEAKING_RATE = 0.9;                 // 1.0 = normal speed, 0.9 = a little slower for children
const WORK_FOLDER   = 'Padhai Punjabi Audio';

// ===== STEP 1: run this first to test your key and hear the voice =====
function testVoice() {
  const b64 = synth_('ਕਮਲ। ਇਹ ਬਿੱਲੀ ਹੈ।');
  const file = getFolder_().createFile(
    Utilities.newBlob(Utilities.base64Decode(b64), 'audio/mpeg', 'test-voice.mp3'));
  Logger.log('Voice test OK. Open this file in Drive and play it: ' + file.getUrl());
}

// ===== STEP 2: run this to make all clips (continues by itself if it needs more time) =====
function generateAll() {
  const start = Date.now();
  const props = PropertiesService.getScriptProperties();
  const parts = getPartsFolder_();
  let i = Number(props.getProperty('PA_NEXT') || 0);

  while (i < PA_LIST.length) {
    if (Date.now() - start > 4.5 * 60 * 1000) {          // stay under the 6-minute limit
      props.setProperty('PA_NEXT', String(i));
      scheduleNext_();
      Logger.log('Paused at ' + i + ' of ' + PA_LIST.length + '. It will continue automatically in about 1 minute.');
      return;
    }
    const text = PA_LIST[i];
    const key = paKey_(paClean_(text));
    if (!parts.getFilesByName(key + '.txt').hasNext()) {
      parts.createFile(key + '.txt', synth_(text), MimeType.PLAIN_TEXT);
    }
    i++;
  }
  props.deleteProperty('PA_NEXT');
  clearTriggers_();
  buildBundles_();
}

// ===== If you want to start again from zero (e.g. after changing the voice) =====
function resetAll() {
  PropertiesService.getScriptProperties().deleteProperty('PA_NEXT');
  clearTriggers_();
  const parts = getPartsFolder_();
  const it = parts.getFiles();
  while (it.hasNext()) it.next().setTrashed(true);
  Logger.log('Reset done. Run generateAll again.');
}

// ===== helpers =====
function synth_(text) {
  const url = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(API_KEY);
  const call = voice => UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      input: { text: text },
      voice: voice,
      audioConfig: { audioEncoding: 'MP3', speakingRate: SPEAKING_RATE }
    })
  });
  let res = call({ languageCode: 'pa-IN', name: VOICE_NAME });
  if (res.getResponseCode() === 400) res = call({ languageCode: 'pa-IN' });   // voice name not found -> default Punjabi voice
  if (res.getResponseCode() !== 200) {
    throw new Error('Text-to-Speech error ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 400));
  }
  return JSON.parse(res.getContentText()).audioContent;     // base64 MP3
}

function buildBundles_() {
  const parts = getPartsFolder_();
  const bundles = {};
  const it = parts.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const key = f.getName().replace('.txt', '');
    (bundles[key[0]] = bundles[key[0]] || {})[key] = f.getBlob().getDataAsString();
  }
  const out = getSubFolder_(getFolder_(), 'upload-to-github-audio-pa');
  const old = out.getFiles();
  while (old.hasNext()) old.next().setTrashed(true);
  '0123456789abcdef'.split('').forEach(c => {
    out.createFile('b_' + c + '.json', JSON.stringify(bundles[c] || {}), MimeType.PLAIN_TEXT);
  });
  Logger.log('DONE. Download the 16 files from Drive folder "' + WORK_FOLDER +
             ' / upload-to-github-audio-pa": ' + out.getUrl());
}

// Must match the app exactly (index.html: paClean / paKey)
function paClean_(t) {
  return String(t || '').normalize('NFC').replace(/^[\s।!?.,]+|[\s।!?.,]+$/g, '').replace(/\s+/g, ' ');
}
function paKey_(t) {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(WORK_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(WORK_FOLDER);
}
function getSubFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function getPartsFolder_() { return getSubFolder_(getFolder_(), 'clips'); }

function scheduleNext_() {
  clearTriggers_();
  ScriptApp.newTrigger('generateAll').timeBased().after(60 * 1000).create();
}
function clearTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'generateAll')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
