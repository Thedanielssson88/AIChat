import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

// Registrera pluginet för den fysiska inspelaren på telefonen
const AudioRecorder = registerPlugin<any>('CapacitorAudioRecorder');

export class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isNative = Capacitor.isNativePlatform();
  private active = false; // Håller koll på om vi faktiskt spelar in

  async start(): Promise<void> {
    if (this.active) return; // Förhindra dubbelstart

    if (this.isNative) {
      const status = await AudioRecorder.requestPermissions();
      if (status.recordAudio !== 'granted') {
        throw new Error("Mikrofon-behörighet nekades.");
      }
      await AudioRecorder.startRecording();
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
      this.mediaRecorder.start();
    }
    this.active = true;
  }

  async stop(): Promise<Blob> {
    if (!this.active) {
      // Om man försöker stoppa utan att ha startat, returnera en tom blob istället för att krascha
      return new Blob([], { type: 'audio/webm' });
    }
    this.active = false;

    if (this.isNative) {
      try {
        const result = await AudioRecorder.stopRecording();
        const fileUri = result.uri;

        if (!fileUri) throw new Error("Fick ingen filsökväg från telefonen.");

        const fileData = await Filesystem.readFile({ path: fileUri });
        const base64Data = fileData.data as string;
        
        // Konvertera Base64 till Blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        return new Blob([byteArray], { type: 'audio/m4a' });
      } catch (error: any) {
        throw new Error("Kunde inte läsa in ljudfil: " + error.message);
      }
    } else {
      // WEB-LOGIK
      return new Promise((resolve) => {
        if (!this.mediaRecorder) {
          resolve(new Blob([], { type: 'audio/webm' }));
          return;
        }

        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.stream?.getTracks().forEach(t => t.stop());
          resolve(blob);
        };
        this.mediaRecorder.stop();
      });
    }
  }

  async getNativeAmplitude(): Promise<number> {
    if (this.isNative) {
      try {
        const result = await AudioRecorder.getCurrentAmplitude();
        return result.value;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }
}

// Skapa en instans av tjänsten
export const audioRecorder = new AudioRecorderService();

// Exportera funktionerna explicit så att RecordView hittar dem
export const startRecording = () => audioRecorder.start();
export const stopRecording = () => audioRecorder.stop();
