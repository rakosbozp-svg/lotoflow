import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff, Wand2 } from 'lucide-react'
import { Banner, Button } from './ui'

export type ScanResult = { ok: true } | { ok: false; message: string }

/** Kamera s detekcí QR kódů. Kód předá rodiči, který rozhodne, zda je platný. */
export default function QrScanner({ onCode, demoCodes, hint }: { onCode: (code: string) => Promise<ScanResult> | ScanResult; demoCodes: string[]; hint: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraOff, setCameraOff] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const busy = useRef(false)
  const handler = useRef(onCode)
  handler.current = onCode

  const process = async (code: string, force = false) => {
    const now = Date.now()
    if (busy.current) return
    if (!force && code === last.current.code && now - last.current.at < 2500) return
    last.current = { code, at: now }
    busy.current = true
    try {
      const r = await handler.current(code)
      setError(r.ok ? null : r.message)
      if (!r.ok && navigator.vibrate) navigator.vibrate(200)
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const tick = () => {
          if (stopped) return
          const v = video.current
          if (v && v.readyState >= 2 && ctx) {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            ctx.drawImage(v, 0, 0)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (found?.data) process(found.data)
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      } catch {
        setCameraOff(true)
      }
    }
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") start()
    else setCameraOff(true)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {cameraOff ? (
        <div className="card center" style={{ alignItems: 'center' }}>
          <CameraOff size={40} color="var(--text3)" />
          <div className="title">Kamera není dostupná</div>
          <div className="small muted">Povolte prohlížeči přístup ke kameře, nebo použijte simulovaný sken demo kódů.</div>
        </div>
      ) : (
        <div className="scan-box">
          <video ref={video} playsInline muted />
          <div className={`scan-frame ${error ? 'bad' : ''}`} />
        </div>
      )}
      <div className="small muted center">{hint}</div>
      {error && <Banner title="Kód nelze použít" text={error} tone="danger" />}
      <Button variant="secondary" onClick={() => setShowDemo(!showDemo)}><Wand2 size={18} /> Simulovat sken</Button>
      {showDemo && (
        <div className="card tight">
          {demoCodes.map((c) => <button key={c} className="list-row mono small" onClick={() => process(c, true)}>{c}</button>)}
        </div>
      )}
    </div>
  )
}
