import { Link } from "wouter"
import { ChevronRight } from "lucide-react"

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/40" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-foreground transition-colors truncate max-w-[140px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground/80 font-medium truncate max-w-[180px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
