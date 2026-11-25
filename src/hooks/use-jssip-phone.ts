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

  const [phoneState, setPhoneState] = useState<PhoneState>("idle");
  const [callState, setCallState] = useState<CallState>("idle");
  const [remoteNumber, setRemoteNumber] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

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

        setTimeout(() => {
          setCallState("idle");
        }, 1500);
      };

      session.on("ended", finish);
      session.on("failed", finish);

      const attachTrackHandling = (pc: any) => {
        pc.addEventListener("track", (ev: any) => {
          if (!remoteAudioRef.current) return;

          const remoteStream = ev.streams?.[0] ?? new MediaStream([ev.track]);

          remoteAudioRef.current.srcObject = remoteStream;

          remoteAudioRef.current.play().catch(() => {});
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
          offerToReceiveVideo: false,
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
      pcConfig: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302",
          },
        ],
      },
    });
  }, []);

  const hangup = useCallback(() => {
    sessionRef.current?.terminate();
  }, []);

  const sendDTMF = useCallback((digit: string) => {
    sessionRef.current?.sendDTMF(digit);
  }, []);

  const blindTransfer = useCallback((extension: string) => {
    const session = sessionRef.current;
    const destino = String(extension || "").trim();
    if (!session || !session.isEstablished() || !/^\d{3,6}$/.test(destino)) {
      return false;
    }

    try {
      // Mesmo código de transferência cega usado pelo softphone: # + ramal.
      session.sendDTMF(`#${destino}`);
      return true;
    } catch (error) {
      console.error("[JsSIP] Falha ao enviar transferência cega:", error);
      return false;
    }
  }, []);

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
    call,
    answer,
    hangup,
    sendDTMF,
    isMuted,
    isOnHold,
    toggleMute,
    toggleHold,
    blindTransfer,
    unregister,
  };
}
