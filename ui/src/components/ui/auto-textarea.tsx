import * as React from "react"
import { cn } from "@/lib/utils"

export type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
    ({ className, onChange, ...props }, ref) => {
        const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

        // Combine refs
        React.useImperativeHandle(ref, () => textareaRef.current!)

        const adjustHeight = React.useCallback(() => {
            const textarea = textareaRef.current
            if (textarea) {
                textarea.style.height = "auto"
                textarea.style.height = `${textarea.scrollHeight}px`
            }
        }, [])

        React.useEffect(() => {
            adjustHeight()
        }, [props.value, adjustHeight])

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            adjustHeight()
            if (onChange) {
                onChange(e)
            }
        }

        return (
            <textarea
                ref={textareaRef}
                data-slot="textarea"
                className={cn(
                    "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex min-h-[40px] w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none overflow-hidden",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
                    className
                )}
                onChange={handleChange}
                {...props}
            />
        )
    }
)
AutoTextarea.displayName = "AutoTextarea"

export { AutoTextarea }
