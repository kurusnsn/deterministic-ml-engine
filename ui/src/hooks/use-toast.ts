import { toast as sonnerToast } from "sonner"

type ToastProps = {
    title?: string
    description?: string
    variant?: "default" | "destructive" | "success"
    [key: string]: any
}

export function useToast() {
    function toast({ title, description, variant, ...props }: ToastProps) {
        if (variant === "destructive") {
            return sonnerToast.error(title, {
                description,
                ...props,
            })
        }

        // Default or success
        return sonnerToast.success(title, {
            description,
            ...props,
        })
    }

    return {
        toast,
        dismiss: (toastId?: string) => sonnerToast.dismiss(toastId),
    }
}
