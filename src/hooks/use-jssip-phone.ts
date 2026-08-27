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
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [phoneState, setPhoneState] = useState<PhoneState>("idle");
  const [callState, setCallState] = useState<CallState>("idle");
  const [remoteNumber, setRemoteNumber] = useState("");
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    if (!creds) return;

    const socket = new JsSIP.WebSocketInterface(creds.wss_url);
    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${creds.sip_username}@${creds.sip_domain}`,
      password: creds.sip_password,
      register: true,
      session_timers: false,
    });
    uaRef.current = ua;

    ua.on("registered", () => setPhoneState("registered"));
    ua.on("unregistered", () => setPhoneState("idle"));
    ua.on("registrationFailed", () => setPhoneState("failed"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ua.on("newRTCSession", (e: any) => {
      const session = e.session;

      if (sessionRef.current) {
        if (session.direction === "incoming") session.terminate();
        return;
      }
      sessionRef.current = session;
      setRemoteNumber(session.remote_identity?.uri?.user ?? "");
      setCallState(session.direction === "incoming" ? "incoming" : "calling");

      session.on("progress", () => setCallState((s) => (s === "calling" ? "ringing" : s)));
      session.on("accepted", () => setCallState("active"));
      session.on("confirmed", () => setCallState("active"));
      const finish = () => {
        setCallState("ended");
        sessionRef.current = null;
        setTimeout(() => setCallState("idle"), 1500);
      };
      session.on("ended", finish);
      session.on("failed", finish);

      // Conecta o áudio remoto ao elemento <audio>. Cobre 3 cenários:
      // 1) conexão já existe (comum em chamadas recebidas) e já tem tracks
      //    prontas — nesse caso o evento "track" já disparou e passou, então
      //    puxamos as tracks direto via getReceivers().
      // 2) conexão já existe mas ainda vai receber tracks — o listener abaixo
      //    ainda pega isso a tempo.
      // 3) conexão ainda não existe (comum em chamadas de saída) — esperamos
      //    o evento "peerconnection" do JsSIP.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachTrackHandling = (pc: any) => {
        pc.addEventListener("track", (ev: any) => {
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = ev.streams[0];
        });
        const receivers = pc.getReceivers?.() ?? [];
        const existingTracks = receivers.map((r: any) => r.track).filter(Boolean);
        if (existingTracks.length) {
          const remoteStream = new MediaStream(existingTracks);
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
        }
      };

      if (session.connection) {
        attachTrackHandling(session.connection);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session.on("peerconnection", (data: any) => attachTrackHandling(data.peerconnection));
      }
    });

    setPhoneState("registering");
    ua.start();

    return () => {
      ua.stop();
      uaRef.current = null;
    };
  }, [creds]);

  useEffect(() => {
    if (callState !== "active") {
      setCallDuration(0);
      return;
    }
    const t = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  const call = useCallback(
    (number: string) => {
      if (!uaRef.current || phoneState !== "registered" || !creds) return;
      uaRef.current.call(`sip:${number}@${creds.sip_domain}`, {
        mediaConstraints: { audio: true, video: false },

        rtcOfferConstraints: {
         offerToReceiveAudio: true,
         offerToReceiveVideo: false,
        },

         pcConfig: {
         iceServers: [{ urls: "stun:stun.l.google.com:19302", }],
        },
      });
    },
    [phoneState, creds],
  );

  const answer = useCallback(() => {
    sessionRef.current?.answer({ mediaConstraints: { audio: true, video: false } });
  }, []);

  const hangup = useCallback(() => {
    sessionRef.current?.terminate();
  }, []);

  const sendDTMF = useCallback((digit: string) => {
    sessionRef.current?.sendDTMF(digit);
  }, []);

  return { phoneState, callState, remoteNumber, callDuration, remoteAudioRef, call, answer, hangup, sendDTMF };
}
