import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/db"

const roleStyles: Record<UserRole, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-amber-500/20 text-amber-700 border border-amber-500/30" },
  operator: { label: "Operator", className: "bg-blue-500/15 text-blue-600 border border-blue-500/30" },
  partner: { label: "Partner", className: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" },
  supporter: { label: "Supporter", className: "bg-purple-500/15 text-purple-600 border border-purple-500/30" },
  member: { label: "Member", className: "bg-foreground/10 text-foreground/70 border border-border/60" },
}

export function RoleBadge({ role, className }: { role?: string | null; className?: string }) {
  const normalized = (role || "member").toLowerCase() as UserRole
  const style = roleStyles[normalized] ?? roleStyles.member
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}
