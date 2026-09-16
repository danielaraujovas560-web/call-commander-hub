import { useCallback, useEffect, useRef, useState } from "react";
import JsSIP from "jssip";

export type PhoneState = "idle" | "registering" | "registered" | "failed";
export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "incoming"
  | "active"
  | "ended";

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

  useEffect(() => {
    if (!creds) {
      setPhoneState("idle");
      return;
    }

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

    ua.on("connecting", () => {
    });

    ua.on("connected", () => {
    });

    ua.on("disconnected", () => {
    });

    ua.on("registered", () => {
      setPhoneState("registered");
    });

    ua.on("unregistered", () => {
      setPhoneState("idle");
    });

    ua.on("registrationFailed", (event: any) => {
      console.error(
        "[SIP] REGISTRATION FAILED",
        event?.cause || event,
      );
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

      setRemoteNumber(
        session.remote_identity?.uri?.user ?? "",
      );

      setCallState(
        session.direction === "incoming"
          ? "incoming"
          : "calling",
      );

      session.on("progress", () => {
        setCallState((state) =>
          state === "calling" ? "ringing" : state,
        );
      });

      session.on("accepted", () => {
        setCallState("active");
      });

      session.on("confirmed", () => {
        setCallState("active");
      });

      const finish = () => {
        setCallState("ended");
        sessionRef.current = null;

        setTimeout(() => {
          setCallState("idle");
        }, 1500);
      };

      session.on("ended", finish);
      session.on("failed", finish);

      const attachTrackHandling = (pc: any) => {
        pc.addEventListener("track", (ev: any) => {
          if (remoteAudioRef.current && ev.streams?.[0]) {
            remoteAudioRef.current.srcObject = ev.streams[0];
          }
        });

        const receivers = pc.getReceivers?.() ?? [];
        const tracks = receivers
          .map((receiver: any) => receiver.track)
          .filter(Boolean);

        if (tracks.length && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject =
            new MediaStream(tracks);
        }
      };

      if (session.connection) {
        attachTrackHandling(session.connection);
      } else {
        session.on("peerconnection", (data: any) => {
          attachTrackHandling(data.peerconnection);
        });
      }
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
        if (
          socket._ws &&
          socket._ws.readyState !== WebSocket.CLOSED
        ) {
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
      const ua = uaRef.current;

      if (
        !ua ||
        phoneState !== "registered" ||
        !creds
      ) {
        return;
      }

      ua.call(
        `sip:${number}@${creds.sip_domain}`,
        {
          mediaConstraints: {
            audio: true,
            video: false,
          },
          rtcOfferConstraints: {
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
          },
          pcConfig: {
            iceServers: [
              {
                urls: "stun:stun.l.google.com:19302",
              },
            ],
          },
        },
      );
    },
    [phoneState, creds],
  );

  const answer = useCallback(() => {
    sessionRef.current?.answer({
      mediaConstraints: {
        audio: true,
        video: false,
      },
    });
  }, []);

  const hangup = useCallback(() => {
    sessionRef.current?.terminate();
  }, []);

  const sendDTMF = useCallback((digit: string) => {
    sessionRef.current?.sendDTMF(digit);
  }, []);

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
        if (
          socket?._ws &&
          socket._ws.readyState !== WebSocket.CLOSED
        ) {
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
          if (
            socket?._ws &&
            socket._ws.readyState !== WebSocket.CLOSED
          ) {
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
          console.warn("[SIP] TIMEOUT DO UNREGISTER");
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
    unregister,
  };
}
