import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, Quote } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-16 md:pt-36 md:pb-24">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-accent uppercase tracking-widest mb-6">The Feynman Technique</p>
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-8 leading-tight">
            If you can&apos;t explain it simply, you don&apos;t understand it yet.
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
            Feynman Learn pairs you with people studying the same thing. You take turns explaining.
            That&apos;s when the real learning actually starts.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/signup">
                Find a study group <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              Already have an account?
            </Link>
          </div>
        </div>
      </section>

      {/* Pull quote */}
      <section className="bg-primary/5 border-y border-border py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-5 max-w-2xl">
            <Quote className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div>
              <p className="text-2xl font-medium text-foreground leading-relaxed mb-4">
                &ldquo;The first principle is that you must not fool yourself — and you are the easiest person to fool.&rdquo;
              </p>
              <p className="text-muted-foreground">— Richard Feynman, Nobel Prize-winning physicist</p>
            </div>
          </div>
        </div>
      </section>

      {/* The idea */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              There&apos;s a gap between reading something and knowing it.
            </h2>
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              Most study tools are built around consuming more — more notes, more videos, more flashcards.
              Feynman Learn is built around the opposite: producing explanations.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              The moment you try to explain something out loud, the gaps in your understanding become
              impossible to ignore. That friction is where learning actually happens.
            </p>
          </div>
          <div className="space-y-8">
            {[
              {
                label: "When you explain",
                text: "You find out exactly what you don't know.",
              },
              {
                label: "When you hear a bad explanation",
                text: "You ask the questions that sharpen both of you.",
              },
              {
                label: "When you hear a good one",
                text: "It sticks. Because it had to be earned.",
              },
            ].map((item) => (
              <div key={item.label} className="border-l-2 border-accent pl-6">
                <p className="font-semibold text-foreground mb-1">{item.label}</p>
                <p className="text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">How it works</h2>
            <p className="text-lg text-muted-foreground">
              No algorithms. No gamification. Just people trying to actually understand things.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Find your people",
                body: "Browse active study groups by subject. Filter by level, schedule, or how active the group is.",
              },
              {
                step: "02",
                title: "Take your turn",
                body: "Each session, someone explains a concept to the group. Then the group picks it apart — questions are encouraged.",
              },
              {
                step: "03",
                title: "Go back and fill the gaps",
                body: "The holes in your explanation tell you exactly what to study next. Come back and try again.",
              },
            ].map((item) => (
              <div key={item.step} className="bg-card border border-border rounded-xl p-8">
                <p className="text-4xl font-bold text-primary/30 mb-4">{item.step}</p>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight">
            Stop rereading.<br />Start explaining.
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            A study group is waiting. Free to join, takes about two minutes to get started.
          </p>
          <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/signup">
              Get started <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground">Feynman Learn</p>
          <p className="text-sm text-muted-foreground">
            By using this site, you agree to our{" "}
            <Link
              href="/terms"
              className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              terms and conditions
            </Link>
            .
          </p>
        </div>
      </footer>
    </div>
  )
}
