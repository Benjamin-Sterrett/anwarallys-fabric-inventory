import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Folder path" className="text-sm text-gray-700">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="inline-flex items-center">
            {isLast ? (
              <span className="inline-flex min-h-[44px] items-center px-2 font-medium text-gray-900">
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to ?? '/'}
                className="inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline"
              >
                {item.label}
              </Link>
            )}
            {isLast ? null : <span className="mx-2 text-gray-400">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
