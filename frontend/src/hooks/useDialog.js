import { useEffect, useRef } from 'react'

let scrollLocks = 0
let originalOverflow = ''

export default function useDialog(open, onClose) {
  const ref = useRef(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!open || !ref.current) return
    const dialog = ref.current
    if (scrollLocks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    const previous = document.activeElement
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length && el.tabIndex !== -1 && !el.closest('[hidden], [inert]'))
    const frame = requestAnimationFrame(() => (focusable()[0] || dialog).focus())
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current?.() }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (!controls.length) { event.preventDefault(); dialog.focus(); return }
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); controls[0].focus(); return }
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    dialog.addEventListener('keydown', keydown)
    return () => { if (--scrollLocks === 0) document.body.style.overflow = originalOverflow; cancelAnimationFrame(frame); dialog.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [open])
  return ref
}
