import { createContext, useContext, useEffect, useReducer, useCallback, ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import type { Toast } from '../types'

interface State { toasts: Toast[] }
type Action =
  | { type: 'add'; toast: Toast }
  | { type: 'remove'; id: string }

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'add': return { toasts: [...state.toasts, action.toast] }
    case 'remove': return { toasts: state.toasts.filter(t => t.id !== action.id) }
  }
}

interface ToastCtx {
  addToast: (message: string, type?: Toast['type']) => void
}
const ToastContext = createContext<ToastCtx>({ addToast: () => {} })
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [] })

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    dispatch({ type: 'add', toast: { id, message, type } })
    setTimeout(() => dispatch({ type: 'remove', id }), 5000)
  }, [])

  // SSE for server events
  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data?.message) addToast(data.message, data.type ?? 'info')
      } catch { /* ignore malformed */ }
    }
    return () => es.close()
  }, [addToast])

  const icons = {
    info: <Info size={16} />,
    success: <CheckCircle size={16} />,
    error: <AlertCircle size={16} />,
    warning: <AlertTriangle size={16} />,
  }
  const colors = {
    info: 'bg-blue-600',
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-yellow-600',
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {state.toasts.map(t => (
          <div key={t.id} className={`${colors[t.type]} text-white rounded-lg shadow-lg px-4 py-3 flex items-start gap-3`}>
            <span className="mt-0.5 shrink-0">{icons[t.type]}</span>
            <span className="flex-1 text-sm">{t.message}</span>
            <button onClick={() => dispatch({ type: 'remove', id: t.id })} className="shrink-0 hover:opacity-70">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
