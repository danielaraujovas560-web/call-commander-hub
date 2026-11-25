import { useCallback, useEffect, useRef, useState } from "react";
import JsSIP from "jssip";

export type PhoneState = "idle" | "registering" | "registered" | "failed";
export type CallState = "idle" | "calling" | "ringing" | "incoming" | "active" | "ended";

export type SipCreds = {
  sip_username: string;
  sip_password: string;
  wss_url: string;
  sip_domain: string;
};

export function useJsSipPhone(creds: SipCreds | null) {
  const uaRef = useRef<JsSIP.UA | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketRef = useRef<any>(null);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);

  const [phoneState, setPhoneState] = useState<PhoneState>("idle");
  const [callState, setCallState] = useState<CallState>("idle");
  const [remoteNumber, setRemoteNumber] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);

  useEffect(() => {
    if (!creds) {
      setPhoneState("idle");
      return;
    }

    JsSIP.debug.disable();

    const socket = new JsSIP.WebSocketInterface(creds.wss_url);
    socketRef.current = socket;

    const originalOnConnect = socket.onconnect;
    const originalOnDisconnect = socket.ondisconnect;

    socket.onconnect = () => {
      originalOnConnect?.();
    };

    socket.ondisconnect = () => {
      originalOnDisconnect?.();
    };

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${creds.sip_username}@${creds.sip_domain}`,
      password: creds.sip_password,
      register: true,
      session_timers: false,
    });

    uaRef.current = ua;

    ua.on("connecting", () => {});
    ua.on("connected", () => {});
    ua.on("disconnected", () => {});

    ua.on("registered", () => {
      setPhoneState("registered");
    });

    ua.on("unregistered", () => {
      setPhoneState("idle");
    });

    ua.on("registrationFailed", () => {
      setPhoneState("failed");
    });

    ua.on("newRTCSession", (e: any) => {
      const session = e.session;

      if (sessionRef.current) {
        if (session.direction === "incoming") {
          session.terminate();
        }
        return;
      }

      sessionRef.current = session;
      setIsMuted(false);
      setIsOnHold(false);
      setIsVideoEnabled(false);

      setRemoteNumber(session.remote_identity?.uri?.user ?? "");
      setCallState(session.direction === "incoming" ? "incoming" : "calling");

      session.on("progress", () => {
        setCallState((state) => (state === "calling" ? "ringing" : state));
      });

      session.on("accepted", () => {
        setCallState("active");
      });

      session.on("confirmed", () => {
        setCallState("active");
      });

      session.on("hold", () => setIsOnHold(true));
      session.on("unhold", () => setIsOnHold(false));

      const finish = () => {
        setCallState("ended");
        setIsMuted(false);
        setIsOnHold(false);
        sessionRef.current = null;
        localVideoStreamRef.current?.getTracks().forEach((track) => track.stop());
        localVideoStreamRef.current = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setIsVideoEnabled(false);

        setTimeout(() => {
          setCallState("idle");
        }, 1500);
      };

      session.on("ended", finish);
      session.on("failed", finish);

      const attachTrackHandling = (pc: any) => {
        pc.addEventListener("track", (ev: any) => {
          const remoteStream = ev.streams?.[0] ?? new MediaStream([ev.track]);
          if (ev.track.kind === "audio" && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          } else if (ev.track.kind === "video" && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(() => {});
          }
        });
      };

      if (session.connection) {
        attachTrackHandling(session.connection);
      } else {
        session.on("peerconnection", (data: any) => {
          attachTrackHandling(data.peerconnection);
        });
      }

      session.on("confirmed", () => {
        if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
          remoteAudioRef.current.play().catch(() => {});
        }
      });
    });

    setPhoneState("registering");
    ua.start();

    return () => {
      if (sessionRef.current) {
        try {
          sessionRef.current.terminate();
        } catch {}

        sessionRef.current = null;
      }

      try {
        ua.stop();
      } catch {}

      try {
        if (socket._ws && socket._ws.readyState !== WebSocket.CLOSED) {
          socket.disconnect();
        }
      } catch {}

      if (uaRef.current === ua) {
        uaRef.current = null;
      }

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [creds]);

  useEffect(() => {
    if (callState !== "active") {
      setCallDuration(0);
      return;
    }

    const timer = setInterval(() => {
      setCallDuration((duration) => duration + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [callState]);

  const call = useCallback(
    (number: string) => {
      if (!uaRef.current || phoneState !== "registered" || !creds) {
        return;
      }

      uaRef.current.call(`sip:${number}@${creds.sip_domain}`, {
        mediaConstraints: {
          audio: true,
          video: false,
        },
        pcConfig: {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
          ],
        },
        rtcOfferConstraints: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        },
      });
    },
    [phoneState, creds],
  );

  const answer = useCallback(() => {
    sessionRef.current?.answer({
      mediaConstraints: {
        audio: true,
        video: false,
      },
      rtcAnswerConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      },
      pcConfig: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302",
          },
        ],
      },
    });
  }, []);

  const toggleVideo = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !session.isEstablished()) throw new Error("A chamada ainda não está estabelecida");
    const pc = session.connection;
    if (!pc) throw new Error("Conexão WebRTC indisponível");

    if (localVideoStreamRef.current) {
      const stream = localVideoStreamRef.current;
      const sender = pc.getSenders().find((item: RTCRtpSender) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(null);
      stream.getTracks().forEach((item) => item.stop());
      localVideoStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setIsVideoEnabled(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera não disponível neste navegador");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 24 } },
    });
    const track = stream.getVideoTracks()[0];
    if (!track || sessionRef.current !== session || !session.isEstablished()) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error("A chamada foi encerrada antes de ativar a câmera");
    }
    try {
      const transceiver = pc.getTransceivers().find((item: RTCRtpTransceiver) =>
        item.sender?.track?.kind === "video" || item.receiver?.track?.kind === "video"
      );
      if (transceiver) {
        await transceiver.sender.replaceTrack(track);
        if (transceiver.direction === "recvonly" || transceiver.direction === "inactive") transceiver.direction = "sendrecv";
      } else {
        pc.addTransceiver(track, { direction: "sendrecv", streams: [stream] });
      }
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const done = (error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          error ? reject(error) : resolve();
        };
        const timeout = setTimeout(() => done(new Error("Tempo limite ao negociar vídeo")), 12000);
        try {
          const started = session.renegotiate({
            rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: true },
            eventHandlers: {
              succeeded: () => done(),
              failed: (event: any) => done(new Error(event?.cause || "Falha ao negociar vídeo")),
            },
          }, () => done());
          if (started === false) done(new Error("Não foi possível iniciar a negociação de vídeo"));
        } catch (error) {
          done(error instanceof Error ? error : new Error(String(error)));
        }
      });
      localVideoStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      setIsVideoEnabled(true);
    } catch (error) {
      stream.getTracks().forEach((item) => item.stop());
      const sender = pc.getSenders().find((item: RTCRtpSender) => item.track === track);
      if (sender) await sender.replaceTrack(null).catch(() => {});
      throw error;
    }
  }, []);

  const hangup = useCallback(() => {
    sessionRef.current?.terminate();
  }, []);

  const sendDTMF = useCallback((digit: string) => {
    sessionRef.current?.sendDTMF(digit);
  }, []);

  const sendDTMFSequence = useCallback(async (digits: string) => {
    const session = sessionRef.current;
    const sequence = String(digits || "");
    if (!session || !session.isEstablished() || !/^[0-9*#]+$/.test(sequence)) return false;

    try {
      for (let index = 0; index < sequence.length; index += 1) {
        if (sessionRef.current !== session || !session.isEstablished()) return false;
        session.sendDTMF(sequence[index], {
          transportType: "RFC2833",
          duration: 160,
          interToneGap: 500,
        });
        if (index < sequence.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
      return true;
    } catch (error) {
      console.error("[JsSIP] Falha ao enviar sequência DTMF:", error);
      return false;
    }
  }, []);

  const blindTransfer = useCallback(async (extension: string) => {
    const destino = String(extension || "").trim();
    if (!/^\d{1,20}$/.test(destino)) return false;
    // Mesmo fluxo do Invertus Softphone: # + ramal.
    return sendDTMFSequence("#" + destino);
  }, [sendDTMFSequence]);

  const startAttendedTransfer = useCallback(async (extension: string) => {
    const destino = String(extension || "").trim();
    const session = sessionRef.current;
    if (!session || !session.isEstablished() || !/^\d{1,20}$/.test(destino)) return false;

    // O Asterisk assume a consulta; não abrimos uma segunda sessão JsSIP.
    if (!await sendDTMFSequence("*1")) return false;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (sessionRef.current !== session || !session.isEstablished()) return false;
    return sendDTMFSequence(destino);
  }, [sendDTMFSequence]);

  const completeAttendedTransfer = useCallback(
    () => sendDTMFSequence("*2"),
    [sendDTMFSequence],
  );

  const abortAttendedTransfer = useCallback(
    () => sendDTMFSequence("*1"),
    [sendDTMFSequence],
  );

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !session.isEstablished()) return;

    try {
      if (isMuted) {
        session.unmute({ audio: true });
        setIsMuted(false);
      } else {
        session.mute({ audio: true });
        setIsMuted(true);
      }
    } catch (error) {
      console.error("[JsSIP] Falha ao alternar mute:", error);
    }
  }, [isMuted]);

  const toggleHold = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !session.isEstablished()) return;

    try {
      if (isOnHold) {
        session.unhold();
        setIsOnHold(false);
      } else {
        session.hold();
        setIsOnHold(true);
      }
    } catch (error) {
      console.error("[JsSIP] Falha ao alternar espera:", error);
    }
  }, [isOnHold]);

  const unregister = useCallback(() => {
    const ua = uaRef.current;

    if (!ua) {
      return Promise.resolve();
    }

    if (!ua.isRegistered()) {
      try {
        ua.stop();
      } catch {}

      const socket = socketRef.current;

      try {
        if (socket?._ws && socket._ws.readyState !== WebSocket.CLOSED) {
          socket.disconnect();
        }
      } catch {}

      if (uaRef.current === ua) {
        uaRef.current = null;
      }

      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let finalizado = false;

      const finalizar = () => {
        if (finalizado) return;

        finalizado = true;

        try {
          ua.stop();
        } catch {}

        const socket = socketRef.current;

        try {
          if (socket?._ws && socket._ws.readyState !== WebSocket.CLOSED) {
            socket.disconnect();
          }
        } catch {}

        if (uaRef.current === ua) {
          uaRef.current = null;
        }

        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        resolve();
      };

      ua.once("unregistered", () => {
        finalizar();
      });

      ua.unregister({
        all: true,
      });

      setTimeout(() => {
        if (!finalizado) {
          finalizar();
        }
      }, 3000);
    });
  }, []);

  return {
    phoneState,
    callState,
    remoteNumber,
    callDuration,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    isVideoEnabled,
    toggleVideo,
    call,
    answer,
    hangup,
    sendDTMF,
    isMuted,
    isOnHold,
    toggleMute,
    toggleHold,
    blindTransfer,
    sendDTMFSequence,
    startAttendedTransfer,
    completeAttendedTransfer,
    abortAttendedTransfer,
    unregister,
  };
}
