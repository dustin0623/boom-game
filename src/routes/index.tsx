import { createFileRoute } from "@tanstack/react-router";
import { LoginDialog } from "@/components/auth/LoginDialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Enter the Game — Home" },
      { name: "description", content: "A browser adventure. Log in with email or your Solana, Hive or XRPL wallet." },
      { property: "og:title", content: "Enter the Game — Home" },
      { property: "og:description", content: "A browser adventure. Log in with email or your Solana, Hive or XRPL wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-foreground">Enter the Game</span>
        <LoginDialog />
      </header>

      <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          A browser adventure, built to grow
        </h1>
        <p className="text-lg text-muted-foreground">
          Explore, fight, craft and trade. Log in to start your run.
        </p>
        <LoginDialog />
      </section>
    </main>
  );
}
