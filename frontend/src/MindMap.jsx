import { useRef, useEffect, useState, useCallback } from "react";
import { Download, ZoomIn, ZoomOut, RotateCcw, Brain, BookMarked, Layers } from "lucide-react";

const NODE_COLORS = [
  { bg: "#7C3AED", border: "#9F67FF", light: "rgba(124,58,237,0.15)" },
  { bg: "#4F46E5", border: "#6366F1", light: "rgba(79,70,229,0.15)" },
  { bg: "#10B981", border: "#34D399", light: "rgba(16,185,129,0.15)" },
  { bg: "#F59E0B", border: "#FCD34D", light: "rgba(245,158,11,0.15)" },
  { bg: "#EF4444", border: "#F87171", light: "rgba(239,68,68,0.15)" },
  { bg: "#06B6D4", border: "#22D3EE", light: "rgba(6,182,212,0.15)" },
];

function MindMapCanvas({ mindmap, darkMode }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 60, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const nodesRef = useRef([]);

  const drawRoundedRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Wrap text — no truncation, returns all lines
  const wrapText = (ctx, text, maxWidth) => {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mindmap) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const bg = darkMode ? "#141B2D" : "#FFFFFF";

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    // Offset center slightly to the right to leave room for left side nodes
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);

    const nodes = [];
    const cx = 0, cy = 0;
    const mainR = 78;
    nodes.push({ x: cx, y: cy, r: mainR, label: mindmap.main, type: "center" });

    const branchCount = mindmap.nodes.length;
    const angleStep = (2 * Math.PI) / Math.max(branchCount, 1);
    // Increase branch distance so nodes don't overlap center
    const branchDist = 290;

    mindmap.nodes.forEach((node, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const bx = cx + Math.cos(angle) * branchDist;
      const by = cy + Math.sin(angle) * branchDist;
      const color = NODE_COLORS[i % NODE_COLORS.length];

      nodes.push({ x: bx, y: by, label: node, type: "branch", colorIdx: i, angle });

      // Curved line center → branch
      ctx.beginPath();
      const cp1x = cx + Math.cos(angle) * branchDist * 0.45;
      const cp1y = cy + Math.sin(angle) * branchDist * 0.45;
      ctx.moveTo(cx + Math.cos(angle) * mainR, cy + Math.sin(angle) * mainR);
      ctx.quadraticCurveTo(cp1x, cp1y, bx, by);
      const grad = ctx.createLinearGradient(cx, cy, bx, by);
      grad.addColorStop(0, color.bg + "99");
      grad.addColorStop(1, color.bg + "dd");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Sub-nodes
      const subs = mindmap.subs?.[i] || [];
      const subCount = subs.length;
      const subSpread = Math.min(subCount * 0.28, 1.0);
      subs.forEach((sub, j) => {
        const subAngle = angle + (j - (subCount - 1) / 2) * subSpread;
        const subDist = 190;
        const sx = bx + Math.cos(subAngle) * subDist;
        const sy = by + Math.sin(subAngle) * subDist;
        nodes.push({ x: sx, y: sy, label: sub, type: "sub", colorIdx: i });

        ctx.beginPath();
        const cp2x = bx + Math.cos(subAngle) * subDist * 0.5;
        const cp2y = by + Math.sin(subAngle) * subDist * 0.5;
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(cp2x, cp2y, sx, sy);
        ctx.strokeStyle = color.bg + "66";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });

    // Draw nodes
    nodes.forEach((node, idx) => {
      const color = node.type === "center" ? NODE_COLORS[0] : NODE_COLORS[node.colorIdx % NODE_COLORS.length];
      const isHovered = hoveredNode === idx;

      if (node.type === "center") {
        // Glow
        const glow = ctx.createRadialGradient(node.x, node.y, node.r - 10, node.x, node.y, node.r + 28);
        glow.addColorStop(0, "#7C3AED33");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + 28, 0, Math.PI * 2);
        ctx.fill();

        // Circle fill
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        const cg = ctx.createLinearGradient(node.x - node.r, node.y - node.r, node.x + node.r, node.y + node.r);
        cg.addColorStop(0, "#7C3AED");
        cg.addColorStop(1, "#4F46E5");
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.strokeStyle = "#9F67FF";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Text — full, no truncation
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 12px 'Inter', sans-serif";
        const lines = wrapText(ctx, node.label, node.r * 1.55);
        const lineH = 16;
        const totalH = lines.length * lineH;
        lines.forEach((line, li) => {
          ctx.fillText(line, node.x, node.y - totalH / 2 + lineH / 2 + li * lineH);
        });

      } else if (node.type === "branch") {
        // Wider box to fit full text
        ctx.font = "600 11px 'Inter', sans-serif";
        const textLines = wrapText(ctx, node.label, 150);
        const pw = Math.max(150, ...textLines.map(l => ctx.measureText(l).width + 28));
        const lineH2 = 16;
        const ph = Math.max(44, textLines.length * lineH2 + 20);
        const px = node.x - pw / 2, py = node.y - ph / 2;

        if (isHovered) { ctx.shadowColor = color.bg; ctx.shadowBlur = 20; }

        drawRoundedRect(ctx, px, py, pw, ph, 12);
        const bg2 = ctx.createLinearGradient(px, py, px + pw, py + ph);
        bg2.addColorStop(0, color.bg);
        bg2.addColorStop(1, color.border + "cc");
        ctx.fillStyle = bg2;
        ctx.fill();
        ctx.strokeStyle = color.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const totalH2 = textLines.length * lineH2;
        textLines.forEach((line, li) => {
          ctx.fillText(line, node.x, node.y - totalH2 / 2 + lineH2 / 2 + li * lineH2);
        });

        // Store actual bounds for hit detection
        nodes[idx]._pw = pw; nodes[idx]._ph = ph;

      } else {
        // Sub-node — wider, full text
        ctx.font = "500 10px 'Inter', sans-serif";
        const subLines = wrapText(ctx, node.label, 130);
        const sw = Math.max(130, ...subLines.map(l => ctx.measureText(l).width + 22));
        const lineH3 = 14;
        const sh = Math.max(28, subLines.length * lineH3 + 12);
        const sx2 = node.x - sw / 2, sy2 = node.y - sh / 2;

        drawRoundedRect(ctx, sx2, sy2, sw, sh, 8);
        ctx.fillStyle = darkMode ? color.light : color.bg + "18";
        ctx.fill();
        ctx.strokeStyle = color.bg + "66";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = darkMode ? color.border : color.bg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const totalH3 = subLines.length * lineH3;
        subLines.forEach((line, li) => {
          ctx.fillText(line, node.x, node.y - totalH3 / 2 + lineH3 / 2 + li * lineH3);
        });

        nodes[idx]._sw = sw; nodes[idx]._sh = sh;
      }
    });

    nodesRef.current = nodes;
    ctx.restore();
  }, [mindmap, darkMode, zoom, pan, hoveredNode]);

  // Resize + redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      draw();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - canvas.width / 2 - pan.x) / zoom,
      y: (e.clientY - rect.top - canvas.height / 2 - pan.y) / zoom,
    };
  };

  const handleMouseMove = (e) => {
    const { x, y } = getCanvasCoords(e);
    let found = null;
    nodesRef.current.forEach((node, idx) => {
      if (node.type === "center") {
        if (Math.hypot(x - node.x, y - node.y) < node.r) found = idx;
      } else if (node.type === "branch") {
        const hw = (node._pw || 150) / 2, hh = (node._ph || 44) / 2;
        if (Math.abs(x - node.x) < hw && Math.abs(y - node.y) < hh) found = idx;
      } else {
        const hw = (node._sw || 130) / 2, hh = (node._sh || 28) / 2;
        if (Math.abs(x - node.x) < hw && Math.abs(y - node.y) < hh) found = idx;
      }
    });
    setHoveredNode(found);
    if (dragging) {
      setPan(p => ({ x: p.x + e.clientX - dragStart.x, y: p.y + e.clientY - dragStart.y }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
    if (canvasRef.current) canvasRef.current.style.cursor = found !== null ? "pointer" : dragging ? "grabbing" : "grab";
  };

  const handleMouseDown = (e) => { setDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); };
  const handleMouseUp = () => setDragging(false);
  const handleWheel = (e) => { e.preventDefault(); setZoom(z => Math.min(2.5, Math.max(0.25, z - e.deltaY * 0.001))); };

  const handleDownload = () => {
    const c = canvasRef.current;
    const a = document.createElement("a");
    a.download = "mindmap.png"; a.href = c.toDataURL("image/png"); a.click();
  };

  const resetView = () => { setZoom(0.65); setPan({ x: 60, y: 0 }); };

  return (
    <div ref={containerRef} className="mm-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="mm-canvas"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div className="mm-controls">
        <button className="mm-ctrl-btn" onClick={() => setZoom(z => Math.min(2.5, z + 0.12))} title="Zoom In"><ZoomIn size={14}/></button>
        <span className="mm-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="mm-ctrl-btn" onClick={() => setZoom(z => Math.max(0.25, z - 0.12))} title="Zoom Out"><ZoomOut size={14}/></button>
        <div className="mm-ctrl-divider"/>
        <button className="mm-ctrl-btn" onClick={resetView} title="Reset View"><RotateCcw size={14}/></button>
        <button className="mm-ctrl-btn" onClick={handleDownload} title="Download PNG"><Download size={14}/></button>
      </div>
    </div>
  );
}

export default function MindMapPage({ mindmap, topics, darkMode }) {
  const totalSubs = mindmap ? Object.values(mindmap.subs || {}).reduce((a, b) => a + b.length, 0) : 0;

  return (
    <div className="mm-page">
      <div className="mm-layout">
        <div className="mm-main">
          <div className="mm-header">
            <h2 className="page-h2">Mind Map</h2>
            <span className="badge-pill"><Brain size={12}/> Interactive</span>
          </div>
          <div className="mm-canvas-container">
            {mindmap
              ? <MindMapCanvas mindmap={mindmap} darkMode={darkMode} />
              : <div className="mm-empty"><Brain size={40}/><p>Analyze your materials to generate a mind map.</p></div>
            }
          </div>
          <p className="mm-hint">🖱 Drag to pan &bull; Scroll to zoom &bull; Click nodes to interact</p>
        </div>

        <div className="mm-panel">
          <div className="glass card mm-panel-card">
            <div className="card-label"><Brain size={13}/> Mind Map Overview</div>
            <p className="mm-panel-desc">
              {mindmap
                ? <>This mind map shows the complete structure of <strong>{mindmap.main}</strong> based on your syllabus, notes and PYQs.</>
                : "Upload and analyze files to generate the mind map."
              }
            </p>
            <div className="mm-stats">
              <div className="mm-stat-row">
                <div className="mm-stat-icon" style={{background:"rgba(124,58,237,0.15)",color:"#7C3AED"}}><Brain size={14}/></div>
                <div><p className="mm-stat-val">{mindmap?.nodes?.length || 0}</p><p className="mm-stat-lbl">Main Topics</p></div>
              </div>
              <div className="mm-stat-row">
                <div className="mm-stat-icon" style={{background:"rgba(79,70,229,0.15)",color:"#4F46E5"}}><Layers size={14}/></div>
                <div><p className="mm-stat-val">{totalSubs}</p><p className="mm-stat-lbl">Sub Topics</p></div>
              </div>
              <div className="mm-stat-row">
                <div className="mm-stat-icon" style={{background:"rgba(16,185,129,0.15)",color:"#10B981"}}><BookMarked size={14}/></div>
                <div><p className="mm-stat-val">{topics?.length || 0}</p><p className="mm-stat-lbl">Key Concepts</p></div>
              </div>
            </div>
            {mindmap && (
              <div className="mm-actions" style={{marginTop:16}}>
                <div className="card-label">Actions</div>
                <button className="mm-action-btn" onClick={() => {
                  const c = document.querySelector(".mm-canvas");
                  if (c) { const a = document.createElement("a"); a.download="mindmap.png"; a.href=c.toDataURL(); a.click(); }
                }}>
                  <Download size={13}/> Download PNG
                </button>
              </div>
            )}
          </div>

          {mindmap?.nodes?.length > 0 && (
            <div className="glass card mm-panel-card" style={{marginTop:12}}>
              <div className="card-label"><BookMarked size={13}/> Topics</div>
              {mindmap.nodes.map((node, i) => {
                const color = NODE_COLORS[i % NODE_COLORS.length];
                return (
                  <div key={i} className="mm-topic-row">
                    <div className="mm-topic-dot" style={{background: color.bg}}/>
                    <span className="mm-topic-name">{node}</span>
                    <span className="mm-topic-count">{(mindmap.subs?.[i]||[]).length} sub</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}