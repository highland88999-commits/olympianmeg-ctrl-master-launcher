export const metadata = {
  title: 'World Engine | 3D World Builder',
  description: 'Generate 3D worlds, characters, vehicles, weapons, weather, and objects with AI, and walk through them in a live 3D engine.',
};

export default function WorldEngineLayout({ children }) {
  return <div className="min-h-dvh bg-black text-white antialiased">{children}</div>;
}
