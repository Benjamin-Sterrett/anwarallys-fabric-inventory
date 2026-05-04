import { useNavigate } from 'react-router-dom';

export default function BackButton({ fallbackTo }: { fallbackTo?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        if (fallbackTo && (window.history.state as { idx?: number } | null)?.idx === 0) {
          navigate(fallbackTo, { replace: true });
        } else {
          navigate(-1);
        }
      }}
      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
      aria-label="Go back"
    >
      ← Back
    </button>
  );
}
