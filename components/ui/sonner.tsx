"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-brand" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin text-ink-soft" />,
      }}
      style={
        {
          "--normal-bg": "var(--sem-surface)",
          "--normal-text": "var(--sem-ink)",
          "--normal-border": "var(--sem-border)",
          "--success-bg": "var(--sem-success-soft)",
          "--success-text": "var(--sem-ink)",
          "--success-border": "var(--sem-success)",
          "--error-bg": "var(--sem-danger-soft)",
          "--error-text": "var(--sem-danger)",
          "--error-border": "var(--sem-danger)",
          "--warning-bg": "var(--sem-warning-soft)",
          "--warning-text": "var(--sem-ink)",
          "--warning-border": "var(--sem-warning)",
          "--border-radius": "var(--radius-card)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-elevated font-sans text-sm",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
