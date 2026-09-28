// World Engine — external resource links.
//
// The original list contained an affiliate tracking redirect
// (openartai.pxf.io/c/...). It now links straight to the tools' own sites.
'use client';

export default function ResourceToolkit() {
  const tools = [
    { name: 'OpenArt AI', url: 'https://openart.ai/' },
    { name: 'Gemini', url: 'https://gemini.google.com/' },
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'Meshy (3D generator)', url: 'https://www.meshy.ai/' },
    { name: 'Filegarden', url: 'https://filegarden.com/' },
  ];

  return (
    <div className="mt-8 border border-[#FFD700] bg-black p-4">
      <h3 className="mb-3 text-xs font-bold tracking-widest text-[#FFD700]">External tools</h3>
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <a
            key={tool.name}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-700 bg-transparent px-3 py-1 text-[10px] uppercase text-gray-400 transition-all hover:border-[#FFD700] hover:text-[#FFD700]"
          >
            {tool.name} &nearr;
          </a>
        ))}
      </div>
    </div>
  );
}
