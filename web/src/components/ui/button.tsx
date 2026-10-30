import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border-4 border-ink font-extrabold tracking-tight whitespace-nowrap shadow-[4px_4px_0_var(--ink)] transition-[transform,box-shadow,background-color] duration-100 outline-none select-none hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--ink)] active:translate-x-1 active:translate-y-1 active:shadow-none focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blurple disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[3] [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-ink text-white",
        sun: "bg-sun text-ink",
        pink: "bg-pink text-ink",
        tangerine: "bg-tangerine text-ink",
        lime: "bg-lime text-ink",
        sky: "bg-sky text-ink",
        blurple: "bg-blurple text-ink",
        destructive: "bg-tomato text-ink",
        outline: "bg-white text-ink",
        ghost: "border-transparent bg-transparent text-ink shadow-none hover:border-ink hover:bg-white hover:shadow-[4px_4px_0_var(--ink)]",
        link: "border-transparent bg-transparent text-ink underline decoration-4 underline-offset-4 shadow-none hover:shadow-none",
      },
      size: {
        default: "h-12 px-5 text-base",
        xs: "h-8 gap-1 rounded-lg border-[3px] px-2 text-xs shadow-[3px_3px_0_var(--ink)] [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-10 gap-1.5 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 px-7 text-lg",
        xl: "h-18 px-9 text-2xl [&_svg:not([class*='size-'])]:size-7",
        icon: "size-12",
        "icon-xs": "size-8 rounded-lg border-[3px] shadow-[3px_3px_0_var(--ink)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
