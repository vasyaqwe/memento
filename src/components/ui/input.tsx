import * as React from "react"

import { cn } from "@/lib/utils"
import { cva } from "class-variance-authority"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
   invalid?: string | undefined
}

export const inputVariants = cva(
   `w-full rounded-md border border-border/70 min-h-[36px] bg-background px-3 py-2 text-sm ring-ring ring-offset-2 ring-offset-background 
             placeholder:text-muted-foreground focus-visible:outline-none
                focus-visible:border-border disabled:cursor-not-allowed disabled:opacity-50
                 data-[invalid=true]:ring-2 data-[invalid=true]:ring-destructive`
)

const Input = React.forwardRef<HTMLInputElement, InputProps>(
   ({ className, type, invalid, ...props }, ref) => {
      return (
         <input
            data-invalid={Boolean(invalid)}
            type={type}
            className={cn(inputVariants(), className)}
            ref={ref}
            {...props}
         />
      )
   }
)
Input.displayName = "Input"

type ErrorMessageProps = {
   error:
      | {
           message: string
        }
      | undefined
} & React.ComponentProps<"p">

function ErrorMessage({ error, className, ...props }: ErrorMessageProps) {
   return error?.message ? (
      <p
         className={cn("mt-2 text-sm text-destructive", className)}
         {...props}
      >
         {error.message}
      </p>
   ) : null
}

export { Input, ErrorMessage }
