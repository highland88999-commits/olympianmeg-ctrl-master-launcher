export const metadata = {
  title: 'Babel — Tower of Pocket Universes',
  description: 'Climb the tower. Every floor is a pocket universe.',
};

export default function BabelLayout({ children }) {
  return <div className="fixed inset-0 bg-black overflow-hidden">{children}</div>;
}
