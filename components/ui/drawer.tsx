"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

// Reusable right-side panel that slides in/out via Framer Motion.
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  widthClass = "max-w-md",
}: DrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-cream shadow-lift",
              widthClass
            )}
          >
            <div className="flex items-start justify-between border-b-[0.5px] border-line p-6">
              <div>
                {eyebrow && (
                  <p className="font-serif text-base italic text-leaf-accent">
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <h2 className="text-xl font-medium text-ink">{title}</h2>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-stone transition-colors hover:bg-grass-50 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
            {footer && (
              <div className="border-t-[0.5px] border-line p-6">{footer}</div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
