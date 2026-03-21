import { useRef, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { scoreToColour } from '../utils/sentiment'

const LEGEND = [
  { score: -1.0, label: 'Very negative' },
  { score: -0.5, label: 'Negative' },
  { score:  0.0, label: 'Neutral' },
  { score:  0.5, label: 'Positive' },
  { score:  1.0, label: 'Very positive' },
]

export default function GraphView({ graphData, onSelectArticle }) {
  const fgRef = useRef()

  const handleNodeClick = useCallback((node) => {
    onSelectArticle(node)
  }, [onSelectArticle])

  const paintNode = useCallback((node, ctx, globalScale) => {
    const radius = 8
    const colour = scoreToColour(node.sentimentScore ?? 0)

    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = colour
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    if (globalScale >= 1.4) {
      ctx.font = `${10 / globalScale}px sans-serif`
      ctx.fillStyle = 'var(--text, #6b6375)'
      ctx.textAlign = 'center'
      ctx.fillText(node.source?.name ?? node.source ?? '', node.x, node.y + radius + 8 / globalScale)
    }
  }, [])

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="graph-empty">
        No graph data yet — analyse some articles to see connections appear here.
      </div>
    )
  }

  return (
    <div className="graph-wrap">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkLabel={(link) => link.sharedTopics?.join(', ') ?? ''}
        linkColor={() => 'rgba(156,163,175,0.4)'}
        linkWidth={1.5}
        onNodeClick={handleNodeClick}
        nodeLabel={(node) => `${node.title}\nScore: ${(node.sentimentScore ?? 0).toFixed(2)}`}
        width={900}
        height={480}
        backgroundColor="transparent"
        cooldownTicks={100}
      />
      <div className="graph-legend">
        {LEGEND.map(({ score, label }) => (
          <div key={score} className="legend-item">
            <span className="legend-dot" style={{ background: scoreToColour(score) }} />
            <span className="legend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
