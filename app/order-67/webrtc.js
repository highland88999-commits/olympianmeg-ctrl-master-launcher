// app/order-67/webrtc.js — thin RTCPeerConnection wrapper for Order 67.
// Non-trickle ICE: we wait for gathering to complete, then ship the whole
// SDP through the OASIS room row. Slower to connect by a second or two,
// but the signaling stays race-free on a 2s poll loop.

import { ICE_SERVERS } from '@/lib/order-67';

export function createPeerConnection(onRemoteStream) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.ontrack = (event) => {
    const stream = event.streams && event.streams[0];
    if (stream && onRemoteStream) onRemoteStream(stream);
  };
  return pc;
}

export function waitForIceGatheringComplete(pc, timeoutMs = 9000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

/** Host side: create the offer (local description has full candidates). */
export async function makeOffer(pc) {
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);
  return pc.localDescription ? pc.localDescription.sdp : null;
}

/** Guest side: accept the offer, produce the answer. */
export async function makeAnswer(pc, offerSdp) {
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGatheringComplete(pc);
  return pc.localDescription ? pc.localDescription.sdp : null;
}

/** Host side: accept the guest's answer. */
export async function acceptAnswer(pc, answerSdp) {
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

export function closePeerConnection(pc) {
  try {
    if (pc) pc.close();
  } catch {
    /* already closed */
  }
}

export function stopStream(stream) {
  try {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* already stopped */
  }
}
