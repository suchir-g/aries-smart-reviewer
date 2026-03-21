// score: -1.0 to 1.0 → CSS rgb colour
// red (#ef4444) at -1 → grey (#9ca3af) at 0 → green (#22c55e) at +1
export function scoreToColour(score) {
  if (score >= 0) {
    const t = score
    const r = Math.round(156 + (34  - 156) * t)
    const g = Math.round(163 + (197 - 163) * t)
    const b = Math.round(175 + (94  - 175) * t)
    return `rgb(${r},${g},${b})`
  } else {
    const t = score + 1
    const r = Math.round(239 + (156 - 239) * t)
    const g = Math.round(68  + (163 - 68)  * t)
    const b = Math.round(68  + (175 - 68)  * t)
    return `rgb(${r},${g},${b})`
  }
}
