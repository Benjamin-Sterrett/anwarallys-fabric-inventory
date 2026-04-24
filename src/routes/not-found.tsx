import { Link } from 'react-router-dom';

export default function NotFoundRoute() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          That link does not go anywhere yet.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Go to the home page
        </Link>
      </div>
    </section>
  );
}
