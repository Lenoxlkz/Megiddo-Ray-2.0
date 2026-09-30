import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold text-emerald-400">404</h1>
        <p className="text-neutral-400">Page not found • Página no encontrada</p>
        <Link href="/" className="inline-block px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm transition-colors">
          Return Home • Volver al Inicio
        </Link>
      </div>
    </div>
  );
}
