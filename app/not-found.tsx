import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="panel max-w-lg p-10 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Cranium</p>
        <h1 className="mt-4 font-display text-4xl">Map not found</h1>
        <p className="mt-4 text-slate-600">The workspace you’re looking for doesn’t exist or you no longer have access to it.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
