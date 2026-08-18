import Link from "next/link";

import { TopNav } from "@/components/top-nav";

export default async function LandingPage() {
  return (
    <main className="min-h-screen">
      <TopNav />

      <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1500px] flex-col items-center justify-center px-4 text-center md:px-6">
        <div className="animate-fade-up">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Mind mapping intelligence</p>
          <h1 className="mt-6 font-display text-7xl md:text-8xl">Cranium</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Convert notes, lectures, and presentations into interactive mind maps with AI explanations,
            summaries, flashcards, quizzes, and written evaluation tools.
          </p>
        </div>
      </section>
    </main>
  );
}
