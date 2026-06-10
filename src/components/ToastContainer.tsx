"use client"
import { useEffect, useState } from "react"
import type { Toast } from "@/hooks/useToast"

const ICON: Record<string, string> = { success: "✓", error: "✕", info: "·" }
const STYLE: Record<string, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-500 text-white",
  info: "bg-gray-800 text-white",
}

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium pointer-events-auto transition-all duration-300 min-w-[220px] max-w-xs ${STYLE[t.type]} ${visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
      <span className="shrink-0 text-xs font-bold">{ICON[t.type]}</span>
      <span className="flex-1 leading-snug">{t.message}</span>
      <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 text-xs ml-1">✕</button>
    </div>
  )
}

export function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => <ToastItem key={t.id} t={t} onClose={() => dismiss(t.id)} />)}
    </div>
  )
}
