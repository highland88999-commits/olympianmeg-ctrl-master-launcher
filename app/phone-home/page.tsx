'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Device } from '@twilio/voice-sdk';
import { Phone, PhoneOff, MessageSquare, Radio, Video, Delete } from 'lucide-react';

export default function GlassCommsApp() {
  const router = useRouter();

  const [currentPage, setCurrentPage] = useState<number>(2); 
  const [session, setSession] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [dialString, setDialString] = useState('');
  const [twilioDevice, setTwilioDevice] = useState<Device | null>(null);
  const [twilioCall, setTwilioCall] = useState<any>(null);

  const [roomCode, setRoomCode] = useState('');
  const [inCall, setInCall] = useState(false);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [videoRoomCode, setVideoRoomCode] = useState('');
  const [inVideoCall, setInVideoCall] = useState(false);
  const localVideoStream = useRef<MediaStream | null>(null);
  const videoPeerConnection = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const ICE_SERVERS = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  const [messages, setMessages] = useState<{ id?: string; sender: string; text: string }[]>([]);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    let messageChannel: any;

    const initialize = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return router.push('/');
      }
      
      setSession(session);
      setMounted(true);

      try {
        const res = await fetch('/api/token');
        const data = await res.json();
        const device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] as any[] });
        await device.register();
        setTwilioDevice(device);
      } catch (error) {
        console.error('Twilio matrix handshake failed', error);
      }

      messageChannel = supabase
        .channel('sgc_mesh_network')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sgc_messages', filter: `recipient_identifier=eq.${session.user.id}` },
          async (payload) => {
            const msg = payload.new;

            if (msg.message_type === 'sms') {
              setMessages((prev) => [...prev, { id: msg.id, sender: 'Peer', text: msg.content }]);
            } else if (msg.message_type === 'webrtc_offer') {
              const pc = new RTCPeerConnection(ICE_SERVERS);
              peerConnection.current = pc;
              pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
              pc.onicecandidate = async (e) => {
                if (e.candidate) await supabase.from('sgc_messages').insert({
                  sender_id: session.user.id, recipient_identifier: msg.sender_id, content: JSON.stringify(e.candidate), message_type: 'webrtc_candidate'
                });
              };
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStream.current = stream;
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));
              await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.content)));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await supabase.from('sgc_messages').insert({
                sender_id: session.user.id, recipient_identifier: msg.sender_id, content: JSON.stringify(answer), message_type: 'webrtc_answer'
              });
              setRoomCode(msg.sender_id);
              setInCall(true);
            } else if (msg.message_type === 'webrtc_answer' && peerConnection.current) {
              await peerConnection.current.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.content)));
            } else if (msg.message_type === 'webrtc_candidate' && peerConnection.current) {
              await peerConnection.current.addIceCandidate(new RTCIceCandidate(JSON.parse(msg.content)));
            } else if (msg.message_type === 'webrtc_video_offer') {
              const pc = new RTCPeerConnection(ICE_SERVERS);
              videoPeerConnection.current = pc;
              pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
              pc.onicecandidate = async (e) => {
                if (e.candidate) await supabase.from('sgc_messages').insert({
                  sender_id: session.user.id, recipient_identifier: msg.sender_id, content: JSON.stringify(e.candidate), message_type: 'webrtc_video_candidate'
                });
              };
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
              localVideoStream.current = stream;
              if (localVideoRef.current) localVideoRef.current.srcObject = stream;
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));
              await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.content)));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await supabase.from('sgc_messages').insert({
                sender_id: session.user.id, recipient_identifier: msg.sender_id, content: JSON.stringify(answer), message_type: 'webrtc_video_answer'
              });
              setVideoRoomCode(msg.sender_id);
              setInVideoCall(true);
            } else if (msg.message_type === 'webrtc_video_answer' && videoPeerConnection.current) {
              await videoPeerConnection.current.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.content)));
            } else if (msg.message_type === 'webrtc_video_candidate' && videoPeerConnection.current) {
              await videoPeerConnection.current.addIceCandidate(new RTCIceCandidate(JSON.parse(msg.content)));
            }
          }
        )
        .subscribe();
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/');
      else setSession(session);
    });

    return () => {
      subscription.unsubscribe();
      if (messageChannel) supabase.removeChannel(messageChannel);
      if (twilioDevice) twilioDevice.destroy();
    };
  }, [router]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 60 && currentPage < 3) setCurrentPage((prev) => prev + 1); 
    if (diff < -60 && currentPage > 0) setCurrentPage((prev) => prev - 1); 
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const toggleCall = async () => {};

  const toggleVideoCall = async () => {
    if (!inVideoCall) {
      if (!videoRoomCode) {
        alert('Enter a target Peer Node Hash.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localVideoStream.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        videoPeerConnection.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
        pc.onicecandidate = async (e) => {
          if (e.candidate && session) {
            await supabase.from('sgc_messages').insert({
              sender_id: session.user.id, recipient_identifier: videoRoomCode, content: JSON.stringify(e.candidate), message_type: 'webrtc_video_candidate'
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (session) {
          await supabase.from('sgc_messages').insert({
            sender_id: session.user.id, recipient_identifier: videoRoomCode, content: JSON.stringify(offer), message_type: 'webrtc_video_offer'
          });
        }
        setInVideoCall(true);
      } catch (e) {
        console.error('Video Init failed:', e);
      }
    } else {
      localVideoStream.current?.getTracks().forEach((track) => track.stop());
      videoPeerConnection.current?.close();
      videoPeerConnection.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setInVideoCall(false);
    }
  };

  const BackgroundVideo = () => (
    <video autoPlay loop muted playsInline className="absolute top-0 left-0 w-full h-full object-cover z-0 pointer-events-none opacity-90">
      <source src="https://files.catbox.moe/qlxfyk.mp4" type="video/mp4" />
    </video>
  );

  if (!mounted || !session) return <div className="w-screen h-screen bg-black" />;

  return (
    <main 
      className="min-h-screen w-full flex flex-col items-center justify-between relative text-slate-300 select-none overflow-hidden bg-black [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
    >
      <button 
        onClick={() => router.push('/')}
        className="absolute z-50 px-4 py-2 text-[10px] font-bold tracking-widest text-zinc-400 uppercase transition-colors border rounded top-5 right-5 bg-black/80 border-zinc-700 hover:text-fuchsia-400 hover:border-fuchsia-400"
      >
        EXIT MATRIX
      </button>

      <BackgroundVideo />

      <header className="w-full max-w-md pt-8 px-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent pb-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse" />
          <span className="text-[10px] tracking-widest uppercase text-slate-300 drop-shadow-md">Mesh Active</span>
        </div>
      </header>

      <div className="w-full max-w-md flex-1 relative overflow-hidden flex z-10">
        <div 
          className="w-[400%] h-full flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentPage * (100 / 4)}%)` }}
        >
          {/* PAGE 0: WebRTC Audio */}
          <section className="w-1/4 h-full flex flex-col items-center justify-center px-6 gap-6">
            <div className="w-full rounded-3xl border border-white/15 bg-black/40 backdrop-blur-3xl p-6 flex flex-col items-center gap-6 shadow-2xl">
              <Radio className="w-12 h-12 text-slate-300 stroke-1 animate-pulse" />
              <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
              <div className="text-center">
                <h2 className="text-sm font-light tracking-widest uppercase text-slate-100">Audio Node</h2>
                <p className="text-[11px] text-slate-400 font-light mt-1">Direct Link</p>
              </div>
              <input
                type="text"
                placeholder="Peer Node Hash"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-center text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-300 transition"
              />
              <button
                onClick={toggleCall}
                className={`w-full py-3 rounded-2xl border text-xs tracking-widest uppercase transition bg-black/30 backdrop-blur-md ${
                  inCall ? 'border-red-500/50 text-red-300' : 'border-white/20 text-slate-200 hover:border-slate-300'
                }`}
              >
                {inCall ? 'Terminate' : 'Initialize Audio'}
              </button>
            </div>
          </section>

          {/* PAGE 1: WebRTC Video */}
          <section className="w-1/4 h-full flex flex-col items-center justify-center px-6 gap-6">
            <div className="w-full rounded-3xl border border-white/15 bg-black/40 backdrop-blur-3xl p-4 flex flex-col items-center gap-4 shadow-2xl">
              <div className="relative w-full aspect-video bg-black/80 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
                 {!inVideoCall && <Video className="w-8 h-8 text-slate-500 animate-pulse" />}
                 <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                 <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-2 right-2 w-20 aspect-video object-cover rounded-lg border border-white/20 bg-black shadow-lg z-10" />
              </div>
              <input
                type="text"
                placeholder="Target Peer Hash"
                value={videoRoomCode}
                onChange={(e) => setVideoRoomCode(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-center text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-300 transition tracking-widest"
              />
              <button
                onClick={toggleVideoCall}
                className={`w-full py-3 rounded-2xl border text-xs tracking-widest uppercase transition bg-black/30 backdrop-blur-md ${
                  inVideoCall ? 'border-red-500/50 text-red-300' : 'border-white/20 text-slate-200 hover:border-slate-300'
                }`}
              >
                {inVideoCall ? 'Terminate' : 'Initialize Video'}
              </button>
            </div>
          </section>

          {/* PAGE 2: Twilio PSTN Dialer */}
          <section className="w-1/4 h-full flex flex-col items-center justify-between px-6 py-4">
            <div className="w-full flex flex-col items-center mt-2 rounded-2xl bg-black/20 backdrop-blur-md border border-white/10 p-4">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">PSTN Trunk Gateway</span>
              <div className="h-12 flex items-center justify-center">
                <p className="text-3xl font-extralight tracking-widest text-slate-100">
                  {dialString || <span className="text-slate-500 font-thin tracking-normal">Enter Number</span>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-y-4 gap-x-6 w-full max-w-[280px]">
              {[ { n: '1', l: '' }, { n: '2', l: 'ABC' }, { n: '3', l: 'DEF' }, { n: '4', l: 'GHI' }, { n: '5', l: 'JKL' }, { n: '6', l: 'MNO' }, { n: '7', l: 'PQRS' }, { n: '8', l: 'TUV' }, { n: '9', l: 'WXYZ' }, { n: '*', l: '' }, { n: '0', l: '+' }, { n: '#', l: '' }].map((btn) => (
                <button
                  key={btn.n}
                  onClick={() => setDialString((prev) => prev + btn.n)}
                  className="w-16 h-16 rounded-full border border-white/20 bg-black/30 backdrop-blur-xl flex flex-col items-center justify-center hover:border-slate-200 hover:bg-white/5 active:scale-95 transition-all shadow-lg"
                >
                  <span className="text-xl font-light text-slate-100">{btn.n}</span>
                  {btn.l && <span className="text-[7px] tracking-widest text-slate-400">{btn.l}</span>}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-6 w-full max-w-[280px] mb-4">
              <div className="w-14" />
              <button 
                onClick={async () => {
                  if (twilioCall) {
                    twilioCall.disconnect();
                    setTwilioCall(null);
                  } else if (twilioDevice && dialString) {
                    const call = await twilioDevice.connect({ params: { To: dialString } });
                    setTwilioCall(call);
                    call.on('disconnect', () => setTwilioCall(null));
                  }
                }}
                className={`w-16 h-16 rounded-full border bg-black/40 backdrop-blur-xl flex items-center justify-center transition active:scale-95 shadow-lg ${
                  twilioCall ? 'border-red-500/50 text-red-300' : 'border-white/30 text-slate-100 hover:border-slate-100'
                }`}
              >
                {twilioCall ? <PhoneOff className="w-6 h-6 stroke-1" /> : <Phone className="w-6 h-6 stroke-1" />}
              </button>
              {dialString ? (
                <button 
                  onClick={() => setDialString((prev) => prev.slice(0, -1))}
                  className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-slate-200 transition bg-black/20 backdrop-blur-md rounded-full border border-white/5"
                >
                  <Delete className="w-5 h-5 stroke-1" />
                </button>
              ) : <div className="w-14" />}
            </div>
          </section>

          {/* PAGE 3: Text */}
          <section className="w-1/4 h-full flex flex-col px-6 py-4 justify-between">
          </section>
        </div>
      </div>

      <footer className="w-full max-w-md py-6 px-8 flex justify-around border-t border-white/15 z-10 bg-gradient-to-t from-black/90 to-black/20 backdrop-blur-sm">
        <button onClick={() => setCurrentPage(0)} className={`flex flex-col items-center gap-1.5 transition duration-300 ${currentPage === 0 ? 'text-slate-100 scale-110' : 'text-slate-500'}`}>
          <Radio className="w-5 h-5 stroke-1" />
          <span className="text-[9px] uppercase tracking-widest">Audio</span>
        </button>
        <button onClick={() => setCurrentPage(1)} className={`flex flex-col items-center gap-1.5 transition duration-300 ${currentPage === 1 ? 'text-slate-100 scale-110' : 'text-slate-500'}`}>
          <Video className="w-5 h-5 stroke-1" />
          <span className="text-[9px] uppercase tracking-widest">Video</span>
        </button>
        <button onClick={() => setCurrentPage(2)} className={`flex flex-col items-center gap-1.5 transition duration-300 ${currentPage === 2 ? 'text-slate-100 scale-110' : 'text-slate-500'}`}>
          <Phone className="w-5 h-5 stroke-1" />
          <span className="text-[9px] uppercase tracking-widest">Dialer</span>
        </button>
        <button onClick={() => setCurrentPage(3)} className={`flex flex-col items-center gap-1.5 transition duration-300 ${currentPage === 3 ? 'text-slate-100 scale-110' : 'text-slate-500'}`}>
          <MessageSquare className="w-5 h-5 stroke-1" />
          <span className="text-[9px] uppercase tracking-widest">Text</span>
        </button>
      </footer>
    </main>
  );
}


