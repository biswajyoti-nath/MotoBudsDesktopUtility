import { useDeviceStore } from '../store/useDeviceStore';
import { Gamepad2, Volume2, Radio, ShieldCheck, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';

export const SoundMenu = () => {
  const { name, gameMode, setGameMode, volBoost, setVolBoost, setCurrentView } = useDeviceStore();

  const isPlusModel = name === 'Moto Buds+';

  const handleToggleGameMode = () => {
    setGameMode(!gameMode);
  };

  return (
    <>
      <motion.div 
        className="right-content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
      >
        <div className="page-header">
          <h1 className="page-title">Sound</h1>
          <p className="page-subtitle">Audio codecs, enhancement layers & acoustic DSP</p>
        </div>

        {/* ─── Stream Architecture Info Card ─── */}
        <div style={{
          padding: '14px 18px',
          backgroundColor: 'rgba(20, 20, 26, 0.75)',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backdropFilter: 'blur(12px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(14, 165, 233, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)'
            }}>
              <Cpu size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-1)' }}>
                PipeWire Pro Audio Pipeline
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
                {isPlusModel ? 'Sony LDAC 990 kbps (HQ)' : 'AAC 256 kbps HD • Sinc Resampler (Q:10) • 96 kHz Clock'}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            <ShieldCheck size={14} />
            <span>Harman DSP Active</span>
          </div>
        </div>

        <div className="settings-group">
          {/* Spatial Audio — Only for Moto Buds+ */}
          {isPlusModel && (
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-icon">
                  <Radio size={18} />
                </div>
                <div className="setting-text">
                  <span className="setting-title">Spatial Audio</span>
                  <span className="setting-desc">Immersive three-dimensional audio head tracking</span>
                </div>
              </div>
            </div>
          )}

          {/* Gaming Mode */}
          <div className="setting-row">
            <div className="setting-info">
              <div className={`setting-icon ${gameMode ? 'accent' : ''}`}>
                <Gamepad2 size={18} />
              </div>
              <div className="setting-text">
                <span className="setting-title">Game Mode</span>
                <span className="setting-desc">Minimise audio latency for fast gaming response</span>
              </div>
            </div>
            <button className={`toggle ${gameMode ? 'on' : 'off'}`} onClick={handleToggleGameMode}>
              <div className="toggle-thumb" />
            </button>
          </div>

          {/* Volume Booster */}
          <div className="setting-row">
            <div className="setting-info">
              <div className={`setting-icon ${volBoost ? 'accent' : ''}`}>
                <Volume2 size={18} />
              </div>
              <div className="setting-text">
                <span className="setting-title">Volume Boost</span>
                <span className="setting-desc">Hardware amplifier gain enhancement</span>
              </div>
            </div>
            <button className={`toggle ${volBoost ? 'on' : 'off'}`} onClick={() => setVolBoost(!volBoost)}>
              <div className="toggle-thumb" />
            </button>
          </div>

          {/* Equalizer Link */}
          <div className="setting-row interactive" onClick={() => setCurrentView('equalizer')}>
            <div className="setting-info">
              <div className="setting-icon accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                </svg>
              </div>
              <div className="setting-text">
                <span className="setting-title">Parametric Equalizer</span>
                <span className="setting-desc">Interactive visual curve, 7 scientific target curves & ±10 dB headroom</span>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-3)' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      </motion.div>
    </>
  );
};
