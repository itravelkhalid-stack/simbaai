"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

import { ICON } from "@/lib/ui/icons"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      gap={10}
      icons={{
        success: (
          <CircleCheckIcon
            size={ICON.size}
            strokeWidth={ICON.strokeWidth}
            className="text-success"
          />
        ),
        info: (
          <InfoIcon
            size={ICON.size}
            strokeWidth={ICON.strokeWidth}
            className="text-brand"
          />
        ),
        warning: (
          <TriangleAlertIcon
            size={ICON.size}
            strokeWidth={ICON.strokeWidth}
            className="text-warning"
          />
        ),
        error: (
          <OctagonXIcon
            size={ICON.size}
            strokeWidth={ICON.strokeWidth}
            className="text-danger"
          />
        ),
        loading: (
          <Loader2Icon
            size={ICON.size}
            strokeWidth={ICON.strokeWidth}
            className="animate-spin text-ink-soft"
          />
        ),
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
          toast:
            "cn-toast shadow-elevated font-sans text-sm ring-1 ring-border",
          title: "font-heading font-semibold text-ink",
          description: "text-ink-soft",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
