import { PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface TranscriptEntry {
  role: "ai" | "learner";
  text: string;
  final: boolean;
  timestamp: string;
}

export interface Section {
  id: string;
  title: string;
}

export async function connectToSession(
  sessionId: string,
): Promise<{ roomUrl: string; token: string; sections: Section[] }> {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/connect`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to connect session");
  }
  const data = await res.json();
  return { roomUrl: data.room_url, token: data.token, sections: data.sections || [] };
}

export function createPipecatClient(
  callbacks: {
    onBotText: (text: string) => void;
    onUserTranscriptInterim: (text: string) => void;
    onUserTranscriptFinal: (text: string) => void;
    onDisconnected: () => void;
    onCriterionAdvance?: (current: number, total: number) => void;
    onSectionProgress?: (sectionIndex: number, weight: number, floor: number) => void;
    onCorrectionAck?: () => void;
  }
): PipecatClient {
  const transport = new DailyTransport();

  // Audio element for playing received TTS audio from the bot
  let audioElement: HTMLAudioElement | null = null;

  const client = new PipecatClient({
    transport,
    enableMic: true,
    enableCam: false,
    callbacks: {
      // Bot text responses
      onBotLlmText: (data: { text: string }) => callbacks.onBotText(data.text),
      // User transcription events
      onUserTranscript: (data: any) => {
        if (data.final) {
          callbacks.onUserTranscriptFinal(data.text);
        } else {
          callbacks.onUserTranscriptInterim(data.text);
        }
      },
      // Play received audio track from bot TTS
      onTrackStarted: (track: MediaStreamTrack) => {
        if (track.kind === "audio") {
          // Skip local mic track (avoid echo loopback)
          if (track.label?.includes("Microphone") || track.label?.includes("Default")) {
            return;
          }
          if (!audioElement) {
            audioElement = document.createElement("audio");
            audioElement.autoplay = true;
            audioElement.id = "pipecat-bot-audio";
            audioElement.style.display = "none";
            document.body.appendChild(audioElement);
          }
          audioElement.srcObject = new MediaStream([track]);
          audioElement.play().catch(() => {});
        }
      },
      onTrackStopped: (track: MediaStreamTrack) => {
        if (track.kind === "audio" && audioElement) {
          audioElement.srcObject = null;
        }
      },
      onDisconnected: () => {
        if (audioElement) {
          audioElement.srcObject = null;
          audioElement.remove();
          audioElement = null;
        }
        callbacks.onDisconnected();
      },
      // Server-to-client messages via Daily (type: "server-message", data contains our payload)
      onServerMessage: (msg: any) => {
        const type = msg?.type;
        if (type === "criterion_advance" && callbacks.onCriterionAdvance) {
          callbacks.onCriterionAdvance(msg.current_criterion, msg.total_criteria);
        }
        if (type === "section_progress" && callbacks.onSectionProgress) {
          callbacks.onSectionProgress(msg.section_index, msg.weight, msg.floor ?? 0);
        }
        if (type === "correction_ack" && callbacks.onCorrectionAck) {
          callbacks.onCorrectionAck();
        }
      },
    },
  });

  return client;
}

export function sendCorrectionRequest(client: PipecatClient): void {
  try {
    (client as any).sendMessage?.({
      type: "correction_request",
    });
  } catch {
    console.warn("Correction request not supported");
  }
}
