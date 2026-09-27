export const metadata = {
  title: 'Streetball | Full-Court Shootout',
  description: 'A full-court, two-hoop mobile basketball shootout. Drag to aim, let go to shoot.',
};

export const viewport = {
  themeColor: '#04060c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function BasketballLayout({ children }) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#04060c] text-white antialiased">
      {children}
    </div>
  );
}
