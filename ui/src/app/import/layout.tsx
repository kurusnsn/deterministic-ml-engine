'use client';

export default function ImportLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-background">
      {children}
    </div>
  );
}
