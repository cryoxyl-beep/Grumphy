const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const VOICES = {
  jenny: 'en-US-JennyNeural',
  aria: 'en-US-AriaNeural',
  sonia: 'en-IN-SoniaNeural'
};

/**
 * Generates an expressive neural audio MP3 Data URL using Microsoft Edge Neural TTS.
 * @param {string} text - The text to speak.
 * @param {string} voice - The neural voice identifier (default: 'en-US-JennyNeural').
 * @returns {Promise<string|null>} Data URL 'data:audio/mp3;base64,...' or null on failure.
 */
async function generateSpeechAudio(text, voice = 'en-US-JennyNeural') {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return null;
  }

  // Strip markdown, asterisks, brackets, and emojis for natural spoken flow
  const cleanText = text
    .replace(/[*_#`~]/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();

  if (!cleanText) return null;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(cleanText);

    return new Promise((resolve, reject) => {
      const chunks = [];
      audioStream.on('data', (chunk) => chunks.push(chunk));
      audioStream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const dataUrl = `data:audio/mp3;base64,${buffer.toString('base64')}`;
        resolve(dataUrl);
      });
      audioStream.on('error', (err) => {
        console.error('EdgeTTS stream error:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Failed to generate neural TTS:', error.message);
    return null;
  }
}

module.exports = {
  generateSpeechAudio,
  VOICES
};
