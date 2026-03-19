import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-gray-800 text-white p-4">
      <nav className="container mx-auto flex gap-4">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        <Link href="/practice" className="hover:underline">
          Practice
        </Link>
      </nav>
    </header>
  );
}
