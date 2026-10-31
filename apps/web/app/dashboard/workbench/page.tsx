import AppealWorkbench from "../../components/AppealWorkbench";

export default function WorkbenchPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Casework &middot; Appeals Desk
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Denial Appeal Workbench
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Every draft is reviewed by staff before it goes out — nothing here
          is sent automatically.
        </p>
      </header>
      <AppealWorkbench />
    </main>
  );
}
