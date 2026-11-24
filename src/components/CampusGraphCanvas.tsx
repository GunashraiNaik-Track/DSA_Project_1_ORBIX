import { useMemo } from 'react';
import type { GraphSnapshot } from '../types';

interface CampusGraphCanvasProps {
  graph: GraphSnapshot;
  viewerUsername: string;
  highlightedPath?: string[];
  onSelectUser: (username: string) => void;
}

export function CampusGraphCanvas({
  graph,
  viewerUsername,
  highlightedPath = [],
  onSelectUser,
}: CampusGraphCanvasProps) {
  const width = 760;
  const height = 430;
  const cx = width / 2;
  const cy = height / 2;

  const layout = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const byRing: Record<string, typeof graph.nodes> = {
      '0': [],
      '1': [],
      '2': [],
      '3': [],
      'other': [],
    };

    for (const node of graph.nodes) {
      if (node.username === viewerUsername || node.degree === 0) {
        byRing['0'].push(node);
      } else if (node.degree === 1) {
        byRing['1'].push(node);
      } else if (node.degree === 2) {
        byRing['2'].push(node);
      } else if (node.degree === 3) {
        byRing['3'].push(node);
      } else {
        byRing['other'].push(node);
      }
    }

    if (byRing['0'].length > 0) {
      positions[byRing['0'][0].username] = { x: cx, y: cy };
    }

    const ringSpecs: Array<{ key: string; radius: number; phase: number }> = [
      { key: '1', radius: 105, phase: -Math.PI / 2 },
      { key: '2', radius: 170, phase: -Math.PI / 3 },
      { key: '3', radius: 225, phase: -Math.PI / 5 },
      { key: 'other', radius: 265, phase: 0.25 },
    ];

    for (const spec of ringSpecs) {
      const items = byRing[spec.key];
      const count = items.length;
      if (count === 0) continue;
      items.forEach((item, idx) => {
        const angle = spec.phase + (2 * Math.PI * idx) / count;
        const rx = spec.radius * 1.32;
        const ry = spec.radius * 0.78;
        positions[item.username] = {
          x: cx + rx * Math.cos(angle),
          y: cy + ry * Math.sin(angle),
        };
      });
    }

    return positions;
  }, [graph.nodes, viewerUsername]);

  const highlightedEdgeSet = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < highlightedPath.length - 1; i += 1) {
      const a = highlightedPath[i];
      const b = highlightedPath[i + 1];
      s.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
    return s;
  }, [highlightedPath]);

  const highlightedNodeSet = useMemo(() => new Set(highlightedPath), [highlightedPath]);

  return (
    <div className="bg-white border border-[#2B2B2B]/15 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
        <div>
          <h3 className="font-display text-base font-semibold text-[#2B2B2B]">
            Campus Network Graph G(V, E)
          </h3>
          <p className="text-xs text-[#2B2B2B]/75 mt-0.5">
            Concentric BFS rings centered on your node. Click any student node to open their profile.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-[#006E53] font-semibold">
          <span>|V| = {graph.stats.vertices} members</span>
          <span aria-hidden="true">·</span>
          <span>|E| = {graph.stats.edges} connections</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[560px] bg-white rounded-lg border border-[#2B2B2B]/15"
          role="img"
          aria-label="Campus social network adjacency graph"
        >
          {/* Subtle BFS guide ellipses */}
          <ellipse cx={cx} cy={cy} rx={105 * 1.32} ry={105 * 0.78} fill="none" stroke="#2B2B2B" strokeOpacity="0.14" strokeDasharray="4 4" />
          <ellipse cx={cx} cy={cy} rx={170 * 1.32} ry={170 * 0.78} fill="none" stroke="#2B2B2B" strokeOpacity="0.14" strokeDasharray="4 4" />
          <ellipse cx={cx} cy={cy} rx={225 * 1.32} ry={225 * 0.78} fill="none" stroke="#2B2B2B" strokeOpacity="0.14" strokeDasharray="4 4" />

          {/* Edges */}
          {graph.edges.map((edge) => {
            const p1 = layout[edge.source];
            const p2 = layout[edge.target];
            if (!p1 || !p2) return null;
            const key =
              edge.source < edge.target
                ? `${edge.source}|${edge.target}`
                : `${edge.target}|${edge.source}`;
            const isHighlighted = highlightedEdgeSet.has(key);
            return (
              <line
                key={key}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isHighlighted ? '#EC6E3C' : '#2B2B2B'}
                strokeWidth={isHighlighted ? 2.8 : 1.25}
                strokeOpacity={isHighlighted ? 0.95 : 0.22}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const pos = layout[node.username];
            if (!pos) return null;
            const isSelf = node.username === viewerUsername;
            const isPathNode = highlightedNodeSet.has(node.username);

            let fill = '#FFFFFF';
            let stroke = '#006E53';
            let textFill = '#2B2B2B';

            if (isSelf) {
              fill = '#006E53';
              stroke = '#2B2B2B';
              textFill = '#FFFFFF';
            } else if (node.degree === 1) {
              fill = '#EC6E3C';
              stroke = '#2B2B2B';
              textFill = '#2B2B2B';
            } else if (node.degree === 2) {
              fill = '#2B2B2B';
              stroke = '#EC6E3C';
              textFill = '#FFFFFF';
            } else if (node.degree === 3) {
              fill = '#FFFFFF';
              stroke = '#006E53';
              textFill = '#2B2B2B';
            }

            if (isPathNode && !isSelf) {
              stroke = '#EC6E3C';
            }

            const firstName = node.name.split(' ')[0];
            const degLabel = isSelf ? 'You' : node.degree !== null ? `${node.degree}°` : '—';

            return (
              <g
                key={node.username}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectUser(node.username)}
                className="cursor-pointer"
              >
                <circle
                  r={isSelf ? 24 : 18}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isPathNode || isSelf ? 2.5 : 1.5}
                />
                <text
                  textAnchor="middle"
                  dy="0.34em"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                  fill={textFill}
                >
                  {degLabel}
                </text>
                <text
                  y={isSelf ? 36 : 30}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="600"
                  fill="#2B2B2B"
                >
                  {firstName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Explicit accessible legend (not color-only) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#2B2B2B]">
        <span className="font-semibold">BFS Degree Rings:</span>
        <span className="font-medium text-[#006E53]">You (0° center, Kabuki Green)</span>
        <span aria-hidden="true">·</span>
        <span className="font-semibold text-[#EC6E3C]">1° Direct connection (Persimmon)</span>
        <span aria-hidden="true">·</span>
        <span className="font-semibold text-[#2B2B2B]">2° Friend of connection (Sumi Charcoal)</span>
        <span aria-hidden="true">·</span>
        <span className="font-semibold text-[#2B2B2B]/80">3° Three-hop reach (White ring)</span>
      </div>
    </div>
  );
}
