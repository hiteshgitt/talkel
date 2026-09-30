import OpusScript from 'opusscript';
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from 'werift';

/** Headless WebRTC "phone": continuous quiet mic, counts received AI audio, reads control messages. */
export interface FakePhone {
  offer: string;
  accept(sdpAnswer: string): Promise<void>;
  waitForDataChannel(): Promise<void>;
  aiPackets(): number;
  controls: Array<Record<string, unknown>>;
  close(): Promise<void>;
}

export async function createFakePhone(): Promise<FakePhone> {
  const pc = new RTCPeerConnection({
    codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2 })], video: [] },
  });
  const mic = new MediaStreamTrack({ kind: 'audio' });
  const transceiver = pc.addTransceiver(mic, { direction: 'sendrecv' });
  const dc = pc.createDataChannel('oai-events');
  const controls: Array<Record<string, unknown>> = [];
  dc.onMessage.subscribe((m) => controls.push(JSON.parse(m.toString()) as Record<string, unknown>));
  const dcOpen = new Promise<void>((r) => dc.stateChanged.subscribe((s) => s === 'open' && r()));

  let aiPackets = 0;
  pc.onTrack.subscribe((track) => track.onReceiveRtp.subscribe((rtp) => rtp.payload.length > 3 && aiPackets++));

  const encoder = new OpusScript(24000, 1, OpusScript.Application.VOIP);
  let seq = 0;
  let ts = 0;
  const micTimer = setInterval(() => {
    const frame = Buffer.alloc(960);
    for (let i = 0; i < 480; i++) frame.writeInt16LE(Math.round((Math.random() - 0.5) * 60), i * 2);
    ts = (ts + 960) >>> 0;
    const header = new RtpHeader({ payloadType: 111, sequenceNumber: (seq = (seq + 1) & 0xffff), timestamp: ts });
    void transceiver.sender.sendRtp(new RtpPacket(header, encoder.encode(frame, 480))).catch(() => undefined);
  }, 20);

  await pc.setLocalDescription(await pc.createOffer());
  await new Promise<void>((r) => {
    if (pc.iceGatheringState === 'complete') return r();
    pc.iceGatheringStateChange.subscribe((s) => s === 'complete' && r());
  });

  return {
    offer: pc.localDescription!.sdp,
    accept: (sdp) => pc.setRemoteDescription({ type: 'answer', sdp }),
    waitForDataChannel: () => dcOpen,
    aiPackets: () => aiPackets,
    controls,
    close: async () => {
      clearInterval(micTimer);
      await pc.close();
      encoder.delete();
    },
  };
}
