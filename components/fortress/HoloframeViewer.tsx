import { X, Download } from "lucide-react";
import Image from "next/image";

interface HoloframeProps {
  url: string;
  meta: { originName: string; mimeType: string };
  onClose: () => void;
}

export default function HoloframeViewer({ url, meta, onClose }: HoloframeProps) {
  const isImage = meta.mimeType.startsWith("image/");
  const isVideo = meta.mimeType.startsWith("video/");
  const isAudio = meta.mimeType.startsWith("audio/");
  const isText = meta.mimeType.startsWith("text/");

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-4xl h-[75vh] rounded-2xl flex flex-col shadow-[0_0_50px_rgba(0,242,255,0.2)]">
        
        <div className="flex justify-between items-center p-4 border-b border-cyan-400/30 bg-black/50 rounded-t-2xl">
          <span className="text-cyan-400 tracking-[0.2em] font-bold text-xs uppercase">{meta.originName}</span>
          <div className="flex gap-4">
            <a href={url} download={meta.originName} className="btn flex items-center gap-2"><Download size={14}/> DOWNLOAD</a>
            <button onClick={onClose} className="text-fuchsia-500 hover:text-white transition-colors"><X size={20}/></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex justify-center items-center">
          {isImage && <Image src={url} alt="Decrypted file" width={1600} height={1200} unoptimized className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-lg" />}
          {isVideo && <video src={url} controls autoPlay className="max-w-full max-h-full rounded-lg shadow-lg" />}
          {isAudio && <audio src={url} controls autoPlay className="w-full max-w-md" />}
          {isText && (
            <iframe src={url} className="w-full h-full bg-black/50 text-cyan-400 rounded-lg p-4 font-mono border border-cyan-400/20" />
          )}
          {!isImage && !isVideo && !isAudio && !isText && (
            <div className="text-center">
              <p className="text-white/70 mb-6 text-sm tracking-widest">NO HOLOGRAPHIC PREVIEW AVAILABLE FOR THIS FORMAT.</p>
              <a href={url} download={meta.originName} className="btn">DOWNLOAD PAYLOAD</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


