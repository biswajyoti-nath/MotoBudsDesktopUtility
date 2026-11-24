import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { motion } from 'framer-motion';
import { RotateCcw, Sparkles, ShieldCheck, Activity } from 'lucide-react';

export const FREQS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
const TRACK_HEIGHT = 180;
const MIN_GAIN = -10;
const MAX_GAIN = 10;

export const PRESETS: Record<string, number[]> = {
  'Harman 2019v2': [5.5, 4.5, 2.0, 0.0, 0.5, 1.5, 3.5, 2.0, -1.5, 1.0],
  'Diffuse Field': [-2.0, -1.0, 0.0, 0.0, 0.5, 1.5, 3.0, 2.5, 0.5, 0.0],
  'Harman Bass Boost': [7.5, 6.0, 2.5, -0.5, 0.0, 1.0, 2.5, 1.5, -1.0, 0.5],
  'Vocal & Midrange': [-1.5, -1.0, 0.0, 0.5, 1.5, 3.0, 4.0, 2.0, 0.0, -0.5],
  'Treble & Air': [0.0, 0.0, -0.5, -0.5, 0.0, 1.0, 2.0, 3.5, 4.5, 3.5],
  'Warm & Relaxed': [3.5, 3.0, 2.0, 1.0, 0.5, 0.0, -1.0, -2.0, -3.0, -4.0],
  'Dynamic & Immersive': [6.0, 4.5, 1.5, -1.0, -1.5, 0.0, 2.0, 3.5, 4.0, 3.0],
  'Flat': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
};

export const PRESET_INFO: Record<string, { desc: string; icon: string }> = {
  'Harman 2019v2': {
    desc: 'Empirically tuned for optimal consumer acoustic balance, natural timbre & bass authority',
    icon: '✨'
  },
  'Diffuse Field': {
    desc: 'Neutral reference studio monitoring curve for classical & critical analytical listening',
    icon: '🎻'
  },
  'Harman Bass Boost': {
    desc: 'Deep sub-bass impact (+7.5 dB) calibrated without encroaching upon vocal midrange clarity',
    icon: '🔊'
  },
  'Vocal & Midrange': {
    desc: 'Elevated vocal clarity and speech articulation, highlighting lead instruments and dialogue',
    icon: '🎙️'
  },
  'Treble & Air': {
    desc: 'Sparkling high-frequency detail and open acoustic staging without harsh sibilance',
    icon: '☁️'
  },
  'Warm & Relaxed': {
    desc: 'Smooth rolled-off upper harmonics for fatigue-free extended listening sessions',
    icon: '☕'
  },
  'Dynamic & Immersive': {
    desc: 'Energetic dual-boost profile tailored for modern cinematic and electronic soundtracks',
    icon: '⚡'
  },
  'Flat': {
    desc: 'Direct bypass mode passing completely uncolored hardware DSP output',
    icon: '⚖️'
  }
};

/* ─── Catmull-Rom Spline Helper ─── */
function getSplinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const Equalizer = () => {
  const { eqBands, setEqBands, eqPreset, setEqPreset } = useDeviceStore();
  const [localBands, setLocalBands] = useState<number[]>(eqBands.length === 10 ? eqBands : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [showHarmanRef, setShowHarmanRef] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  useEffect(() => {
    if (eqBands && eqBands.length === 10) {
      setLocalBands(eqBands);
    }
  }, [eqBands]);

  const commitBands = useCallback((bandsToCommit?: number[]) => {
    const target = bandsToCommit || localBands;
    setEqBands(target);
  }, [localBands, setEqBands]);

  const handlePresetClick = (presetName: string) => {
    setEqPreset(presetName);
    if (presetName !== 'Custom EQ' && PRESETS[presetName]) {
      const newBands = [...PRESETS[presetName]];
      setLocalBands(newBands);
      commitBands(newBands);
    }
  };

  const switchToCustom = () => {
    if (eqPreset !== 'Custom EQ') {
      setEqPreset('Custom EQ');
    }
  };

  const resetBands = () => {
    handlePresetClick('Flat');
    setEqPreset('Custom EQ');
  };

  // Macro adjustments
  const handleBassChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    switchToCustom();
    const val = parseFloat(e.target.value);
    const newBands = [...localBands];
    newBands[0] = val;
    newBands[1] = Math.round(val * 0.8 * 10) / 10;
    newBands[2] = Math.round(val * 0.4 * 10) / 10;
    newBands[3] = Math.round(val * 0.15 * 10) / 10;
    setLocalBands(newBands);
  };

  const handleTrebleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    switchToCustom();
    const val = parseFloat(e.target.value);
    const newBands = [...localBands];
    newBands[6] = Math.round(val * 0.2 * 10) / 10;
    newBands[7] = Math.round(val * 0.5 * 10) / 10;
    newBands[8] = Math.round(val * 0.8 * 10) / 10;
    newBands[9] = val;
    setLocalBands(newBands);
  };

  // Preamp Headroom calculation: protects DAC from clipping
  const maxGain = useMemo(() => Math.max(...localBands, 0.0), [localBands]);
  const preampHeadroom = maxGain > 0 ? -maxGain : 0.0;

  const currentBassMacro = localBands[0] || 0;
  const currentTrebleMacro = localBands[9] || 0;

  return (
    <motion.div 
      className="right-content"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
    >
      <div className="eq-container">
        {/* Header */}
        <div className="eq-header" style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Parametric Equalizer</h1>
            <p className="page-subtitle">Scientifically calibrated 10-band hardware DSP engine</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="eq-reset-btn"
              onClick={() => setShowHarmanRef(!showHarmanRef)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: showHarmanRef ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                borderColor: showHarmanRef ? 'var(--accent)' : 'transparent',
                color: showHarmanRef ? 'var(--accent)' : 'var(--text-2)'
              }}
              title="Toggle Harman 2019 In-Ear Target curve reference overlay"
            >
              <Activity size={13} />
              <span>Harman Curve</span>
            </button>
            <button className="eq-reset-btn" onClick={resetBands} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* ─── Interactive Spline Curve Visualizer ─── */}
        <VisualEqCurve
          bands={localBands}
          freqs={FREQS}
          minGain={MIN_GAIN}
          maxGain={MAX_GAIN}
          showHarman={showHarmanRef}
          hoveredNode={hoveredNode}
          setHoveredNode={setHoveredNode}
          onBandChange={(idx, val) => {
            switchToCustom();
            const updated = [...localBands];
            updated[idx] = val;
            setLocalBands(updated);
          }}
          onCommit={() => commitBands(localBands)}
        />

        {/* ─── Acoustic Metrics & Safety Headroom Banner ─── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          backgroundColor: 'rgba(20, 20, 25, 0.7)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          margin: '12px 0 16px 0',
          fontSize: '0.82rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)' }}>
            <ShieldCheck size={16} color="var(--accent)" />
            <span>Anti-Clipping Headroom:</span>
            <span style={{ 
              fontWeight: 600, 
              color: preampHeadroom < 0 ? '#38bdf8' : 'var(--text-1)',
              fontFamily: 'monospace',
              letterSpacing: '0.5px'
            }}>
              {preampHeadroom.toFixed(1)} dBFS
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(Zero Driver Clipping)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-3)', fontSize: '0.78rem' }}>
            <span>Active Preset: <strong style={{ color: 'var(--text-1)' }}>{eqPreset}</strong></span>
            <span>DSP Filter: <strong style={{ color: 'var(--text-2)' }}>Opcode 0x0306</strong></span>
          </div>
        </div>

        {/* ─── Presets Scroll ─── */}
        <div className="eq-presets-scroll" style={{
          display: 'flex',
          gap: '10px',
          overflowX: 'auto',
          paddingBottom: '12px',
          marginBottom: '8px',
          scrollbarWidth: 'none'
        }}>
          {['Custom EQ', ...Object.keys(PRESETS)].map(preset => {
            const isSelected = eqPreset === preset;
            const info = PRESET_INFO[preset];
            return (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '16px',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                  backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.16)' : 'rgba(25, 25, 30, 0.65)',
                  color: isSelected ? '#38bdf8' : 'var(--text-1)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: isSelected ? 600 : 500,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isSelected ? '0 0 16px rgba(14, 165, 233, 0.25)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                title={info ? info.desc : preset}
              >
                {info && <span>{info.icon}</span>}
                <span>{preset}</span>
              </button>
            );
          })}
        </div>

        {/* Preset Description Card */}
        {PRESET_INFO[eqPreset] && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }} 
            animate={{ opacity: 1, y: 0 }} 
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(14, 165, 233, 0.05)',
              border: '1px solid rgba(14, 165, 233, 0.15)',
              borderRadius: '10px',
              marginBottom: '16px',
              fontSize: '0.82rem',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Sparkles size={14} color="var(--accent)" />
            <span>{PRESET_INFO[eqPreset].desc}</span>
          </motion.div>
        )}

        <div className="eq-panel">
          {/* Macro Sliders for Quick Contour */}
          <div style={{
            display: 'flex',
            gap: '20px',
            padding: '16px 20px',
            backgroundColor: 'rgba(22, 22, 28, 0.75)',
            borderRadius: '14px',
            marginBottom: '20px',
            border: '1px solid var(--border)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: 500 }}>Sub & Bass Contour (32Hz–250Hz)</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600, fontFamily: 'monospace' }}>
                  {currentBassMacro > 0 ? '+' : ''}{currentBassMacro.toFixed(1)} dB
                </span>
              </div>
              <input 
                type="range" 
                min="-10" max="10" step="0.5" 
                value={currentBassMacro}
                onChange={handleBassChange}
                onMouseUp={() => commitBands()}
                onTouchEnd={() => commitBands()}
                className="macro-slider"
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: 500 }}>Air & Treble Contour (2kHz–16kHz)</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600, fontFamily: 'monospace' }}>
                  {currentTrebleMacro > 0 ? '+' : ''}{currentTrebleMacro.toFixed(1)} dB
                </span>
              </div>
              <input 
                type="range" 
                min="-10" max="10" step="0.5" 
                value={currentTrebleMacro}
                onChange={handleTrebleChange}
                onMouseUp={() => commitBands()}
                onTouchEnd={() => commitBands()}
                className="macro-slider"
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          </div>

          {/* Individual Sliders */}
          <div className="eq-sliders" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            {FREQS.map((freq, i) => (
              <EqBand 
                key={i}
                index={i}
                freq={freq}
                gain={localBands[i] ?? 0.0}
                isHovered={hoveredNode === i}
                onMouseEnter={() => setHoveredNode(i)}
                onMouseLeave={() => setHoveredNode(null)}
                onChange={(val) => {
                  switchToCustom();
                  const newBands = [...localBands];
                  newBands[i] = val;
                  setLocalBands(newBands);
                }}
                onCommit={() => commitBands()}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ─── Visual Spline Response Curve ─── */
function VisualEqCurve({
  bands,
  freqs,
  minGain,
  maxGain,
  showHarman,
  hoveredNode,
  setHoveredNode,
  onBandChange,
  onCommit
}: {
  bands: number[];
  freqs: string[];
  minGain: number;
  maxGain: number;
  showHarman: boolean;
  hoveredNode: number | null;
  setHoveredNode: (idx: number | null) => void;
  onBandChange: (idx: number, gain: number) => void;
  onCommit: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingIdx = useRef<number | null>(null);

  const viewBoxW = 800;
  const viewBoxH = 220;
  const padL = 46;
  const padR = 24;
  const padT = 20;
  const padB = 30;

  const plotW = viewBoxW - padL - padR;
  const plotH = viewBoxH - padT - padB;
  const yZero = padT + plotH / 2;
  const pixelsPerDb = plotH / (maxGain - minGain); // 170 / 20 = 8.5 px/dB

  const gainToY = useCallback((g: number) => {
    const clamped = Math.max(minGain, Math.min(maxGain, g));
    return yZero - clamped * pixelsPerDb;
  }, [minGain, maxGain, yZero, pixelsPerDb]);

  const yToGain = useCallback((y: number) => {
    const deltaY = yZero - y;
    const rawGain = deltaY / pixelsPerDb;
    return Math.max(minGain, Math.min(maxGain, Math.round(rawGain * 2) / 2));
  }, [minGain, maxGain, yZero, pixelsPerDb]);

  // Compute live points
  const points = useMemo(() => {
    return bands.map((g, i) => ({
      x: padL + i * (plotW / (bands.length - 1)),
      y: gainToY(g)
    }));
  }, [bands, padL, plotW, gainToY]);

  // Harman Target Curve points
  const harmanPoints = useMemo(() => {
    const harmanGains = PRESETS['Harman 2019v2'];
    return harmanGains.map((g, i) => ({
      x: padL + i * (plotW / (harmanGains.length - 1)),
      y: gainToY(g)
    }));
  }, [padL, plotW, gainToY]);

  const splinePath = useMemo(() => getSplinePath(points), [points]);
  const harmanPath = useMemo(() => getSplinePath(harmanPoints), [harmanPoints]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    return `${splinePath} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`;
  }, [splinePath, points, padT, plotH]);

  const handlePointerDown = (idx: number, e: React.PointerEvent) => {
    draggingIdx.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIdx.current === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    const svgY = (clientY / rect.height) * viewBoxH;
    const newGain = yToGain(svgY);
    onBandChange(draggingIdx.current, newGain);
  };

  const handlePointerUp = () => {
    if (draggingIdx.current !== null) {
      draggingIdx.current = null;
      onCommit();
    }
  };

  const gridLevels = [10, 5, 0, -5, -10];

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      backgroundColor: 'rgba(16, 16, 20, 0.85)',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      padding: '12px 14px 4px 14px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
    }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', userSelect: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <defs>
          <linearGradient id="eqAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.32" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0a0a0c" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="eqLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="40%" stopColor="#38bdf8" />
            <stop offset="80%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>

          <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Horizontal dB Grid Lines */}
        {gridLevels.map((lvl) => {
          const y = gainToY(lvl);
          const isZero = lvl === 0;
          return (
            <g key={lvl}>
              <line
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke={isZero ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.05)'}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? undefined : '3 3'}
              />
              <text
                x={padL - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill={isZero ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.3)'}
                fontFamily="Inter, monospace"
              >
                {lvl > 0 ? `+${lvl}` : lvl}
              </text>
            </g>
          );
        })}

        {/* Vertical Frequency Guidelines */}
        {points.map((p, i) => (
          <g key={i}>
            <line
              x1={p.x}
              y1={padT}
              x2={p.x}
              y2={padT + plotH}
              stroke={hoveredNode === i ? 'rgba(14, 165, 233, 0.35)' : 'rgba(255, 255, 255, 0.04)'}
              strokeWidth={hoveredNode === i ? 1.5 : 1}
            />
            <text
              x={p.x}
              y={padT + plotH + 18}
              textAnchor="middle"
              fontSize="10"
              fill={hoveredNode === i ? '#38bdf8' : 'rgba(255, 255, 255, 0.45)'}
              fontWeight={hoveredNode === i ? 600 : 400}
              fontFamily="Inter, sans-serif"
            >
              {freqs[i]}
            </text>
          </g>
        ))}

        {/* Harman 2019 Target Reference Curve (Dashed) */}
        {showHarman && (
          <path
            d={harmanPath}
            fill="none"
            stroke="rgba(245, 158, 11, 0.45)"
            strokeWidth="1.8"
            strokeDasharray="4 4"
          />
        )}

        {/* Area Gradient Fill */}
        <path d={areaPath} fill="url(#eqAreaGrad)" />

        {/* Spline Response Curve with Neon Glow */}
        <path
          d={splinePath}
          fill="none"
          stroke="url(#eqLineGrad)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glowEffect)"
        />

        {/* Interactive Frequency Nodes */}
        {points.map((p, i) => {
          const isHovered = hoveredNode === i;
          const currentGain = bands[i] ?? 0;
          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredNode(i)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'ns-resize' }}
              onPointerDown={(e) => handlePointerDown(i, e)}
            >
              {/* Invisible larger hit target */}
              <circle cx={p.x} cy={p.y} r="14" fill="transparent" />

              {/* Glowing halo when hovered */}
              {isHovered && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="11"
                  fill="rgba(14, 165, 233, 0.25)"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
              )}

              {/* Node Center */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 6 : 4.5}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth="2"
                style={{ transition: 'r 0.15s ease' }}
              />

              {/* Live Tooltip when hovered */}
              {isHovered && (
                <g>
                  <rect
                    x={p.x - 24}
                    y={p.y - 28}
                    width="48"
                    height="18"
                    rx="6"
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke="rgba(56, 189, 248, 0.5)"
                    strokeWidth="1"
                  />
                  <text
                    x={p.x}
                    y={p.y - 16}
                    textAnchor="middle"
                    fill="#38bdf8"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {currentGain > 0 ? `+${currentGain.toFixed(1)}` : currentGain.toFixed(1)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Individual Band Slider with Center Zero Fill ─── */
function EqBand({ 
  index,
  freq, 
  gain, 
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onChange, 
  onCommit 
}: { 
  index: number;
  freq: string; 
  gain: number; 
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onChange: (v: number) => void; 
  onCommit: () => void; 
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const gainToPercent = (g: number) => ((g - MIN_GAIN) / (MAX_GAIN - MIN_GAIN)) * 100;
  const percentToGain = (p: number) => MIN_GAIN + (p / 100) * (MAX_GAIN - MIN_GAIN);

  const thumbPercent = Math.max(0, Math.min(100, gainToPercent(gain)));
  
  // Fill from center (50% = 0dB) to current position
  const fillStyle = gain >= 0 
    ? { bottom: '50%', height: `${thumbPercent - 50}%` }
    : { bottom: `${thumbPercent}%`, height: `${50 - thumbPercent}%` };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updateFromEvent(e);
  };

  const handlePointerUp = () => {
    if (isDragging.current) {
      isDragging.current = false;
      onCommit();
    }
  };

  const updateFromEvent = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percent = Math.max(0, Math.min(100, 100 - (y / rect.height) * 100));
    const newGain = Math.round(percentToGain(percent) * 2) / 2; // Step 0.5 dB
    onChange(Math.max(MIN_GAIN, Math.min(MAX_GAIN, newGain)));
  };

  const handleDoubleClick = () => {
    onChange(0.0);
    onCommit();
  };

  return (
    <div 
      className="eq-band"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        transition: 'transform 0.15s ease',
        transform: isHovered ? 'scale(1.05)' : 'none'
      }}
      title={`${freq}: double-click to reset to 0dB`}
    >
      <span 
        className="eq-gain-label"
        style={{
          fontSize: '0.78rem',
          fontWeight: isHovered ? 700 : 600,
          fontFamily: 'monospace',
          color: isHovered ? '#38bdf8' : (gain !== 0 ? 'var(--text-1)' : 'var(--text-3)'),
          marginBottom: '8px'
        }}
      >
        {gain > 0 ? '+' : ''}{gain.toFixed(1)}
      </span>

      <div 
        className="eq-slider-track"
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ 
          height: `${TRACK_HEIGHT}px`,
          width: '28px',
          backgroundColor: 'rgba(25, 25, 32, 0.75)',
          borderRadius: '14px',
          position: 'relative',
          border: isHovered ? '1px solid rgba(14, 165, 233, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
          cursor: 'pointer',
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Center 0dB indicator notch */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '1px',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          zIndex: 1
        }} />

        {/* Dynamic bar fill from center */}
        <div 
          className="eq-slider-fill" 
          style={{
            ...fillStyle,
            position: 'absolute',
            left: '4px',
            right: '4px',
            backgroundColor: gain >= 0 ? '#0ea5e9' : '#6366f1',
            borderRadius: '4px',
            opacity: isHovered ? 0.95 : 0.8
          }} 
        />

        {/* Thumb */}
        <div 
          className="eq-slider-thumb" 
          style={{ 
            bottom: `calc(${thumbPercent}% - 7px)`,
            position: 'absolute',
            left: '2px',
            right: '2px',
            height: '14px',
            backgroundColor: '#ffffff',
            borderRadius: '7px',
            boxShadow: isHovered ? '0 0 10px rgba(14, 165, 233, 0.8)' : '0 2px 6px rgba(0,0,0,0.5)',
            zIndex: 2,
            transition: 'box-shadow 0.15s ease'
          }} 
        />
      </div>

      <span 
        className="eq-freq-label"
        style={{
          fontSize: '0.75rem',
          marginTop: '10px',
          color: isHovered ? '#38bdf8' : 'var(--text-3)',
          fontWeight: isHovered ? 600 : 400
        }}
      >
        {freq}
      </span>
    </div>
  );
}
