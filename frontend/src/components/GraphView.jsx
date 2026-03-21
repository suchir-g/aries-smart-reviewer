import { useRef, useCallback, useState, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { scoreToColour } from '../utils/sentiment'

const LEGEND = [
  { score: -1.0, label: 'Very negative' },
  { score: -0.5, label: 'Negative' },
  { score:  0.0, label: 'Neutral' },
  { score:  0.5, label: 'Positive' },
  { score:  1.0, label: 'Very positive' },
]

// ── Sample data shown when no articles have been analysed yet ────────────────
const SAMPLE_NODES = [
  { id: 's1', title: 'Fed Raises Rates Amid Inflation Concerns',    source: 'Reuters',          sentimentScore: -0.3, sentiment: 'negative', topics: ['interest rates', 'inflation', 'Federal Reserve'], _sample: true },
  { id: 's2', title: 'Inflation Falls to Three-Year Low',           source: 'Financial Times',  sentimentScore:  0.6, sentiment: 'positive', topics: ['inflation', 'economy'],                          _sample: true },
  { id: 's3', title: 'Tech Layoffs Continue as AI Reshapes Jobs',   source: 'The Guardian',     sentimentScore: -0.5, sentiment: 'negative', topics: ['technology', 'artificial intelligence', 'employment'], _sample: true },
  { id: 's4', title: 'OpenAI Unveils Model That Outperforms Rivals',source: 'Wired',             sentimentScore:  0.7, sentiment: 'positive', topics: ['artificial intelligence', 'technology'],          _sample: true },
  { id: 's5', title: 'Climate Summit Reaches Historic Agreement',   source: 'BBC News',         sentimentScore:  0.8, sentiment: 'positive', topics: ['climate change', 'environment', 'policy'],        _sample: true },
  { id: 's6', title: 'EU Pushes Sweeping New Emissions Rules',      source: 'Politico',         sentimentScore:  0.2, sentiment: 'neutral',  topics: ['climate change', 'policy', 'Europe'],             _sample: true },
  { id: 's7', title: 'US Economy Holds Firm Despite Rate Hikes',    source: 'Bloomberg',        sentimentScore:  0.4, sentiment: 'positive', topics: ['economy', 'interest rates', 'Federal Reserve'],   _sample: true },
  { id: 's8', title: 'Employment Numbers Beat Forecasts',           source: 'AP News',          sentimentScore:  0.6, sentiment: 'positive', topics: ['employment', 'economy'],                          _sample: true },
]

const SAMPLE_LINKS = [
  { source: 's1', target: 's2', sharedTopics: ['inflation'],                        _sample: true },
  { source: 's1', target: 's7', sharedTopics: ['interest rates', 'Federal Reserve'], _sample: true },
  { source: 's2', target: 's7', sharedTopics: ['economy'],                           _sample: true },
  { source: 's2', target: 's8', sharedTopics: ['economy'],                           _sample: true },
  { source: 's3', target: 's4', sharedTopics: ['artificial intelligence', 'technology'], _sample: true },
  { source: 's5', target: 's6', sharedTopics: ['climate change', 'policy'],          _sample: true },
  { source: 's7', target: 's8', sharedTopics: ['economy'],                           _sample: true },
]

const SAMPLE_DATA = { nodes: SAMPLE_NODES, links: SAMPLE_LINKS }

// ── Fuzzy topic match (mirrors backend logic) ────────────────────────────────
function topicsMatch(a, b) {
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const wordsA = na.split(/\s+/).filter(w => w.length >= 4)
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length >= 4))
  return wordsA.some(w => wordsB.has(w))
}

export default function GraphView({ graphData, onSelectArticle }) {
  const fgRef = useRef()
  const [activeTopic, setActiveTopic] = useState(null)

  const isSample = !graphData?.nodes?.length

  const activeData = isSample ? SAMPLE_DATA : graphData

  // All unique topics across visible nodes
  const allTopics = useMemo(() => {
    const seen = new Set()
    ;(activeData?.nodes ?? []).forEach(n =>
      (n.topics ?? []).forEach(t => seen.add(t))
    )
    return [...seen].sort()
  }, [activeData])

  // Filter by selected topic
  const filteredData = useMemo(() => {
    if (!activeData) return { nodes: [], links: [] }
    if (!activeTopic) return activeData

    const visibleNodes = activeData.nodes.filter(n =>
      (n.topics ?? []).some(t => topicsMatch(t, activeTopic))
    )
    const visibleIds = new Set(visibleNodes.map(n => n.id))

    return {
      nodes: visibleNodes,
      links: (activeData.links ?? []).filter(l => {
        const src = typeof l.source === 'object' ? l.source.id : l.source
        const tgt = typeof l.target === 'object' ? l.target.id : l.target
        return visibleIds.has(src) && visibleIds.has(tgt)
      }),
    }
  }, [activeData, activeTopic])

  const handleNodeClick = useCallback((node) => {
    if (!node._sample) onSelectArticle(node)
  }, [onSelectArticle])

  const paintNode = useCallback((node, ctx, globalScale) => {
    const radius = 7
    const colour = scoreToColour(node.sentimentScore ?? 0)

    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)

    if (node._sample) {
      // Hollow outlined circle for sample nodes
      ctx.fillStyle = colour + '33'  // ~20% opacity fill
      ctx.fill()
      ctx.setLineDash([3, 2])
      ctx.strokeStyle = colour
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      ctx.fillStyle = colour
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    if (globalScale >= 1.2) {
      const label = node.title
        ? node.title.length > 36 ? node.title.slice(0, 34) + '…' : node.title
        : node.source ?? ''
      const fontSize = 9 / globalScale
      ctx.font = `${fontSize}px sans-serif`
      ctx.fillStyle = node._sample ? 'rgba(26,23,20,0.4)' : 'rgba(26,23,20,0.75)'
      ctx.textAlign = 'center'
      ctx.fillText(label, node.x, node.y + radius + (fontSize + 2))
    }
  }, [])

  return (
    <div className="graph-wrap">
      {isSample && (
        <div className="graph-sample-banner">
          Sample data — analyse articles to build your own graph.
          Hollow nodes and dashed edges are illustrative only.
        </div>
      )}

      {allTopics.length > 0 && (
        <div className="graph-filter">
          <span className="graph-filter-label">Filter by topic</span>
          <div className="graph-filter-chips">
            <button
              className={`graph-chip${!activeTopic ? ' graph-chip-active' : ''}`}
              onClick={() => setActiveTopic(null)}
            >
              All
            </button>
            {allTopics.map(t => (
              <button
                key={t}
                className={`graph-chip${activeTopic === t ? ' graph-chip-active' : ''}`}
                onClick={() => setActiveTopic(prev => prev === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={filteredData}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkLabel={(link) => link.sharedTopics?.join(', ') ?? ''}
        linkColor={(link) => link._sample ? 'rgba(156,163,175,0.25)' : 'rgba(156,163,175,0.5)'}
        linkWidth={1.5}
        linkLineDash={(link) => link._sample ? [4, 3] : null}
        onNodeClick={handleNodeClick}
        nodeLabel={(node) => node._sample
          ? `[Sample] ${node.title ?? ''}`
          : `${node.title ?? ''}\nSource: ${node.source ?? ''}\nScore: ${(node.sentimentScore ?? 0).toFixed(2)}`
        }
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
