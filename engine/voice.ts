import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

const ELEVEN_API_KEY  = process.env['ELEVENLABS_API_KEY'] ?? '';
const ELEVEN_VOICE_ID = process.env['ELEVENLABS_AHRI_VOICE_ID'] ?? '';
const OPENAI_API_KEY  = process.env['OPENAI_API_KEY'] ?? '';

/**
 * Records mic input via node-record-lpcm16 + sox, transcribes via OpenAI Whisper.
 * Falls back to empty string if recording hardware or package is unavailable.
 */
export async function listenForInput(): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn('[voice] OPENAI_API_KEY not set — voice input unavailable.');
    return '';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recordModule: any;
  try {
    // @ts-expect-error — optional peer dependency, not installed by default
    recordModule = await import('node-record-lpcm16');
  } catch {
    console.warn('[voice] node-record-lpcm16 not installed — run: npm install node-record-lpcm16');
    return '';
  }

  const tmpFile = path.join(process.cwd(), 'logs', '.voice-tmp.wav');
  fs.ensureDirSync(path.join(process.cwd(), 'logs'));

  return new Promise(resolve => {
    const chunks: Buffer[] = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recorder: any = recordModule.record({
        sampleRateHertz: 16000,
        threshold: 0.5,
        silence: '2.0',
        recorder: 'sox',
        endOnSilence: true,
      });

      const stream = recorder.stream() as NodeJS.ReadableStream;

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', () => resolve(''));

      // Failsafe: cut off after 20 seconds
      const timeout = setTimeout(() => recorder.stop(), 20000);

      stream.on('end', async () => {
        clearTimeout(timeout);
        try {
          fs.writeFileSync(tmpFile, Buffer.concat(chunks));
          const { OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
          const transcription = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: fs.createReadStream(tmpFile) as unknown as File,
            language: 'en',
          });
          fs.removeSync(tmpFile);
          resolve(transcription.text ?? '');
        } catch (err) {
          console.warn('[voice] Whisper transcription failed:', (err as Error).message);
          resolve('');
        }
      });
    } catch {
      resolve('');
    }
  });
}

/**
 * Converts text to speech via ElevenLabs and plays it non-blocking.
 * Silently skips if keys are missing or playback fails.
 */
export async function speakResponse(text: string): Promise<void> {
  if (!ELEVEN_API_KEY || !ELEVEN_VOICE_ID) return;

  const tmpFile = path.join(process.cwd(), 'logs', '.voice-out.mp3');
  fs.ensureDirSync(path.join(process.cwd(), 'logs'));

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
      {
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          'xi-api-key': ELEVEN_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    fs.writeFileSync(tmpFile, Buffer.from(response.data as ArrayBuffer));
    playAudioNonBlocking(tmpFile);
  } catch (err) {
    console.warn('[voice] ElevenLabs TTS failed:', (err as Error).message);
  }
}

function playAudioNonBlocking(filePath: string): void {
  const platform = process.platform;
  let cmd: string;

  if (platform === 'win32') {
    cmd = `powershell -NoProfile -WindowStyle Hidden -Command "Add-Type -AssemblyName presentationCore; $m = New-Object System.Windows.Media.MediaPlayer; $m.Open([uri]'${filePath}'); $m.Play(); Start-Sleep -Seconds 10"`;
  } else if (platform === 'darwin') {
    cmd = `afplay "${filePath}"`;
  } else {
    cmd = `mpg123 -q "${filePath}" 2>/dev/null || ffplay -nodisp -autoexit "${filePath}" 2>/dev/null`;
  }

  // Non-blocking: exec without await — fire and forget
  execAsync(cmd).catch(() => {});
}
