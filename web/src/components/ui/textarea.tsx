import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border-4 border-ink bg-white px-4 py-3 text-lg font-semibold shadow-[4px_4px_0_var(--ink)] transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:bg-sun/30 focus-visible:shadow-[6px_6px_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20  dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
