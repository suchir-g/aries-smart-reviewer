import { useEffect, useRef } from 'react'

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]'

export default function CustomCursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    let mx = window.innerWidth  / 2
    let my = window.innerHeight / 2
    let rx = mx, ry = my
    let ringScale = 1, targetScale = 1
    let hovering = false, pressed = false
    let raf

    const onMove = (e) => { mx = e.clientX; my = e.clientY }
    const onDown = () => { pressed = true }
    const onUp   = () => { pressed = false }
    const onOver = (e) => {
      hovering = !!e.target.closest(INTERACTIVE)
    }

    const animate = () => {
      // Lerp ring position
      rx += (mx - rx) * 0.22
      ry += (my - ry) * 0.22

      // Lerp ring scale toward target
      targetScale = pressed ? 0.75 : hovering ? 1.65 : 1
      ringScale  += (targetScale - ringScale) * 0.14

      if (dotRef.current) {
        const ds = pressed ? 0.5 : 1
        dotRef.current.style.transform = `translate(${mx}px,${my}px) scale(${ds})`
      }
      if (ringRef.current) {
        ringRef.current.style.transform  = `translate(${rx}px,${ry}px) scale(${ringScale})`
        ringRef.current.style.opacity    = pressed ? '0.6' : hovering ? '0.55' : '0.35'
      }

      raf = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    document.addEventListener('mouseover', onOver)
    raf = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      document.removeEventListener('mouseover', onOver)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <div ref={dotRef}  className="cursor-dot"  />
      <div ref={ringRef} className="cursor-ring" />
    </>
  )
}
