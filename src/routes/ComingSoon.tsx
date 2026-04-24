interface ComingSoonProps {
  title: string;
  detail?: string;
  ticket?: string;
}

// Shared stub for every placeholder route. Kept intentionally plain — feature
// work belongs in dedicated tickets (PRJ-779, -780, -781, -787, -794, etc.).
export default function ComingSoon({ title, detail, ticket }: ComingSoonProps) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">Coming soon</p>
        {detail ? <p className="mt-4 text-sm text-gray-700">{detail}</p> : null}
        {ticket ? (
          <p className="mt-4 text-xs uppercase tracking-wide text-gray-400">
            Tracked in {ticket}
          </p>
        ) : null}
      </div>
    </section>
  );
}
