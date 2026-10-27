import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const BACKEND_URL = "https://pwa-smart-automation.onrender.com";
const socket = io(BACKEND_URL, { autoConnect: true });

export default function App() {
  const [telemetry, setTelemetry] = useState({
    lamp: false,
    fan: false,
    kettle: false,
    kettleMode: 'Off',
    kettleRem: 0,
    rice: false,
    riceAlarm: false,
    riceRem: 0,
    ricePct: 0,
    temp: 0.0,
    csiEnabled: true,
    csiTest: false,
    csiTestRem: 0,
    csiMotion: false,
    csiScore: 0.0,
    espOnline: false,
    breakerTripped: false,
  });

  // UI Theme & Focus Navigation States
  const [darkMode, setDarkMode] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualFocus, setManualFocus] = useState(null);

  // --- Native Push Notification States & Refs ---
  const isFirstRender = useRef(true);
  const prevRiceAlarm = useRef(false);
  const prevKettle = useRef(false);
  const [notifPermission, setNotifPermission] = useState(
    "Notification" in window ? Notification.permission : "default"
  );

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
    }
  };

  // Auto-request permission on initial app load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      requestNotificationPermission();
    }
  }, []);

  // Socket Connection
  useEffect(() => {
    socket.on('telemetry', (data) => setTelemetry(data));
    return () => {
      socket.off('telemetry');
    };
  }, []);

  // --- Timer Completion Notification Trigger Logic ---
  useEffect(() => {
    // Skip the first render so old alarms don't fire on a fresh app reload
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevRiceAlarm.current = telemetry.riceAlarm;
      prevKettle.current = telemetry.kettle;
      return;
    }

    const sendPushNotification = (title, body) => {
      if ("Notification" in window && Notification.permission === "granted") {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, {
              body: body,
              icon: "/icon.svg",
              vibrate: [200, 100, 200, 100, 200]
            });
          });
        } else {
          new Notification(title, { body, icon: "/icon.svg" });
        }
      }
    };

    // Trigger when Rice Cooker hits 100% (alarm switches to active)
    if (telemetry.riceAlarm && !prevRiceAlarm.current) {
      sendPushNotification("🍚 Rice is Ready!", "The smart rice cooker has finished its cycle.");
    }

    // Trigger when Kettle timer finishes (switches from heating to standby)
    if (!telemetry.kettle && prevKettle.current) {
      sendPushNotification("🫖 Kettle Finished", "Your hot water is ready.");
    }

    // Sync previous states for the next render
    prevRiceAlarm.current = telemetry.riceAlarm;
    prevKettle.current = telemetry.kettle;
  }, [telemetry]);

  const sendCommand = async (cmd) => {
    try {
      await fetch(`${BACKEND_URL}/api/control/${cmd}`);
    } catch (error) {
      console.error("Command execution error:", error);
    }
  };

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const activeLoadCount = [
    telemetry.lamp,
    telemetry.fan,
    telemetry.kettle,
    telemetry.rice,
  ].filter(Boolean).length;

  const currentFocus = manualFocus !== null 
    ? (manualFocus === 'none' ? null : manualFocus)
    : (telemetry.lamp ? 'lamp' : telemetry.fan ? 'fan' : telemetry.kettle ? 'kettle' : telemetry.rice ? 'rice' : null);

  const toggleFocus = (cardName) => {
    if (currentFocus === cardName) {
      setManualFocus('none');
    } else {
      setManualFocus(cardName);
    }
  };

  const isRadarActive = telemetry.csiEnabled || telemetry.csiTest;
  const showRadarMotionEffect = isRadarActive && telemetry.csiMotion;

  return (
    <div className={`ios-app ${darkMode ? 'dark-mode' : ''} ${telemetry.breakerTripped ? 'emergency-active' : ''}`}>
      
      {/* Floating Emergency Warning Banner */}
      {telemetry.breakerTripped && (
        <div className="emergency-banner">
          <div className="emergency-banner-content">
            <span className="emergency-icon">🚨</span>
            <span>EMERGENCY CUT-OFF: POWER ISOLATED</span>
          </div>
          <button
            onClick={() => sendCommand('BREAKER_RESET')}
            className="emergency-dismiss-btn"
          >
            Reset Grid
          </button>
        </div>
      )}

      <div className="ios-container">
        
        {/* iOS Navigation Header */}
        <header className="ios-header">
          <div>
            <div className="header-meta">SMART HOME ECOSYSTEM</div>
            <h1 className="header-title">Control Center</h1>
          </div>

          <div className="header-right-tools">
            <div className="ios-menu-wrapper">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="ios-menu-btn"
                title="Settings"
              >
                ☰
              </button>

              {menuOpen && (
                <div className="ios-menu-dropdown">
                  <div className="menu-item">
                    <span>🌙 Dark Mode</span>
                    <label className="ios-switch">
                      <input
                        type="checkbox"
                        checked={darkMode}
                        onChange={() => setDarkMode(!darkMode)}
                      />
                      <span className="ios-slider"></span>
                    </label>
                  </div>
                  {/* Manual Notification Enable Button */}
                  {notifPermission !== 'granted' && (
                    <div 
                      className="menu-item" 
                      onClick={requestNotificationPermission}
                      style={{ cursor: 'pointer', color: '#007AFF', fontWeight: '600' }}
                    >
                      <span>🔔 Enable Notifications</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard Grid Container */}
        <div className={`ios-grid ${currentFocus ? `grid-focus-${currentFocus}` : ''}`}>

          {/* Digital Circuit Breaker Card */}
          <div className="ios-card full-span">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon">⚡</span>
                <span className="card-title">Digital Circuit Breaker</span>
              </div>
              <span
                className={`ios-pill ${
                  telemetry.breakerTripped ? 'pill-red-pulse' : 'pill-green'
                }`}
              >
                {telemetry.breakerTripped ? 'Power Isolated' : 'Grid Active'}
              </span>
            </div>

            <p className="card-subtitle mb-16">
              {telemetry.breakerTripped
                ? '⚠️ Emergency Cut-Off Active! All load circuits isolated & automation locked.'
                : 'Main load lines armed and operating normally.'}
            </p>

            <div className="ios-btn-row">
              <button
                onClick={() => sendCommand('BREAKER_TRIP')}
                className="ios-btn ios-btn-red flex-1"
              >
                🚨 Trip Breaker (Cut Power)
              </button>
              <button
                onClick={() => sendCommand('BREAKER_RESET')}
                className={`ios-btn ${
                  telemetry.breakerTripped ? 'ios-btn-blue' : 'ios-btn-glass'
                } flex-1`}
              >
                Reset Grid
              </button>
            </div>
          </div>

          {/* ESP32 Hardware Node & Climate Card */}
          <div className="ios-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon">💻</span>
                <span className="card-title">ESP32 Node</span>
              </div>
              <span className={`ios-pill ${telemetry.espOnline ? 'pill-green' : 'pill-gray'}`}>
                {telemetry.espOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="climate-display">
              <div className="temp-value">
                {telemetry.temp.toFixed(1)}<span className="temp-unit">°C</span>
              </div>
              <p className="card-subtitle">
                {telemetry.temp >= 33.0 ? '🔥 Room Cooling Active' : 'Optimal Climate'}
              </p>
            </div>
          </div>

          {/* Active Devices Card */}
          <div className="ios-card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="card-icon">🎛️</span>
                <span className="card-title">Active Devices</span>
              </div>
              <span className={`ios-pill ${activeLoadCount > 0 ? 'pill-blue' : 'pill-gray'}`}>
                {activeLoadCount > 0 ? `${activeLoadCount} Running` : 'All Standby'}
              </span>
            </div>
            <div className="active-summary-box">
              <div className="summary-value">
                {activeLoadCount} <span className="summary-unit">/ 4 Loads</span>
              </div>
              <p className="card-subtitle mb-16">
                AP Network: <strong>Home Automation</strong>
              </p>
            </div>
            <div className="mini-badge-list">
              <span className={`mini-badge ${telemetry.lamp ? 'badge-active' : ''}`}>
                💡 Lamp {telemetry.lamp ? 'ON' : 'OFF'}
              </span>
              <span className={`mini-badge ${telemetry.fan ? 'badge-active' : ''}`}>
                🌀 Fan {telemetry.fan ? 'ON' : 'OFF'}
              </span>
              <span className={`mini-badge ${telemetry.kettle ? 'badge-active' : ''}`}>
                🫖 Kettle {telemetry.kettle ? 'HEAT' : 'OFF'}
              </span>
              <span className={`mini-badge ${telemetry.rice ? 'badge-active' : ''}`}>
                🍚 Rice {telemetry.rice ? 'COOK' : 'OFF'}
              </span>
            </div>
          </div>

          {/* ESPectre CSI Radar Card */}
          <div
            onClick={() => toggleFocus('csi')}
            className={`ios-card csi-card full-span ${
              currentFocus === 'csi' ? 'card-active-focus' : ''
            } ${
              showRadarMotionEffect ? 'csi-motion-alert' : 'csi-normal-scan'
            }`}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {showRadarMotionEffect && (
              <div className="csi-radar-overlay motion-active" style={{ overflow: 'hidden' }}>
                <div className="radar-center-ping"></div>
                <span className="radar-ring r1"></span>
                <span className="radar-ring r2"></span>
                <span className="radar-ring r3"></span>
              </div>
            )}

            <div className="card-header">
              <div className="card-title-group">
                <span className={`card-icon ${isRadarActive ? 'csi-radar-icon' : ''}`}>
                  📡
                </span>
                <span className="card-title">ESPectre CSI Radar</span>
              </div>
              <div className="header-right-actions">
                <span
                  className={`ios-pill ${
                    telemetry.csiTest
                      ? telemetry.csiMotion
                        ? 'pill-red-pulse'
                        : 'pill-orange'
                      : !telemetry.csiEnabled
                      ? 'pill-gray'
                      : telemetry.csiMotion
                      ? 'pill-red-pulse'
                      : 'pill-green'
                  }`}
                >
                  {telemetry.csiTest
                    ? telemetry.csiMotion
                      ? `Test: Motion (${telemetry.csiTestRem}s)`
                      : `Testing (${telemetry.csiTestRem}s)`
                    : !telemetry.csiEnabled
                    ? 'Disabled'
                    : telemetry.csiMotion
                    ? 'Motion Detected'
                    : 'Clear'}
                </span>
                {currentFocus === 'csi' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setManualFocus('none'); }}
                    className="ios-card-close-btn"
                    title="Dismiss Spotlight"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="csi-metrics-grid">
              <div className="metric-box">
                <span className="metric-label">Signal Variance</span>
                <span className="metric-value">{telemetry.csiScore.toFixed(2)}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Motion Threshold</span>
                <span className="metric-value">1.80</span>
              </div>
            </div>

            <div className="btn-stack">
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('CSI_TEST'); setManualFocus('csi'); }}
                className="ios-btn ios-btn-orange full-width"
              >
                ⚡ Run 10s CSI Radar Test
              </button>
              <div className="ios-btn-row">
                <button
                  onClick={(e) => { e.stopPropagation(); sendCommand('CSI_ON'); setManualFocus('csi'); }}
                  className={`ios-btn ${telemetry.csiEnabled ? 'ios-btn-blue' : 'ios-btn-glass'} flex-1`}
                >
                  Radar On
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); sendCommand('CSI_OFF'); }}
                  className={`ios-btn ${!telemetry.csiEnabled ? 'ios-btn-red' : 'ios-btn-glass'} flex-1`}
                >
                  Radar Off
                </button>
              </div>
            </div>
          </div>

          {/* 1. DESK LAMP CARD */}
          <div
            onClick={() => toggleFocus('lamp')}
            className={`ios-card lamp-card ${
              currentFocus === 'lamp' ? 'card-active-focus' : ''
            }`}
          >
            <div className="card-header">
              <div className="card-title-group">
                <span className={`card-icon ${telemetry.lamp ? 'lamp-glowing-icon' : ''}`}>
                  💡
                </span>
                <span className="card-title">Desk Lamp</span>
              </div>
              <div className="header-right-actions">
                <span className={`ios-pill ${telemetry.lamp ? 'pill-green' : 'pill-gray'}`}>
                  {telemetry.lamp ? 'Active' : 'Standby'}
                </span>
                {currentFocus === 'lamp' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setManualFocus('none'); }}
                    className="ios-card-close-btn"
                    title="Dismiss Spotlight"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <p className="card-subtitle mb-16">
              {telemetry.lamp ? 'Workspace illuminated' : 'Light powered off'}
            </p>
            <div className="ios-btn-row">
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('R1_ON'); setManualFocus('lamp'); }}
                className={`ios-btn ${telemetry.lamp ? 'ios-btn-blue' : 'ios-btn-glass'} flex-1`}
              >
                Turn On
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('R1_OFF'); }}
                className={`ios-btn ${!telemetry.lamp ? 'ios-btn-glass-active' : 'ios-btn-glass'} flex-1`}
              >
                Turn Off
              </button>
            </div>
          </div>

          {/* 2. CLIP FAN CARD */}
          <div
            onClick={() => toggleFocus('fan')}
            className={`ios-card fan-card ${
              currentFocus === 'fan' ? 'card-active-focus' : ''
            }`}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {(currentFocus === 'fan' || telemetry.fan) && (
              <div className="wind-streams" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <span className="wind-line line-1"></span>
                <span className="wind-line line-2"></span>
                <span className="wind-line line-3"></span>
              </div>
            )}

            <div className="card-header" style={{ position: 'relative', zIndex: 2 }}>
              <div className="card-title-group">
                <span className={`card-icon ${telemetry.fan ? 'fan-spinning-icon' : ''}`}>
                  🌀
                </span>
                <span className="card-title">Clip Fan</span>
              </div>
              <div className="header-right-actions">
                <span className={`ios-pill ${telemetry.fan ? 'pill-green' : 'pill-gray'}`}>
                  {telemetry.fan ? 'Active' : 'Standby'}
                </span>
                {currentFocus === 'fan' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setManualFocus('none'); }}
                    className="ios-card-close-btn"
                    title="Dismiss Spotlight"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <p className="card-subtitle mb-16" style={{ position: 'relative', zIndex: 2 }}>
              {telemetry.fan ? 'Airflow enabled' : 'Fan powered off'}
            </p>
            <div className="ios-btn-row" style={{ position: 'relative', zIndex: 2 }}>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('R2_ON'); setManualFocus('fan'); }}
                className={`ios-btn ${telemetry.fan ? 'ios-btn-blue' : 'ios-btn-glass'} flex-1`}
              >
                Turn On
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('R2_OFF'); }}
                className={`ios-btn ${!telemetry.fan ? 'ios-btn-glass-active' : 'ios-btn-glass'} flex-1`}
              >
                Turn Off
              </button>
            </div>
          </div>

          {/* 3. SMART KETTLE CARD */}
          <div
            onClick={() => toggleFocus('kettle')}
            className={`ios-card full-span kettle-card ${
              currentFocus === 'kettle' ? 'card-active-focus' : ''
            }`}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {(currentFocus === 'kettle' || telemetry.kettle) && (
              <div className="smokey-overlay" style={{ overflow: 'hidden' }}>
                <div className="smoke-glow-base"></div>
                <div className="smoke-puff puff-1"></div>
                <div className="smoke-puff puff-2"></div>
                <div className="smoke-puff puff-3"></div>
                <div className="smoke-puff puff-4"></div>
              </div>
            )}

            <div className="card-header" style={{ position: 'relative', zIndex: 2 }}>
              <div className="card-title-group">
                <span className={`card-icon ${telemetry.kettle ? 'kettle-boiling-icon' : ''}`}>
                  🫖
                </span>
                <span className="card-title">Smart Kettle</span>
              </div>
              <div className="header-right-actions">
                <span className={`ios-pill ${telemetry.kettle ? 'pill-orange' : 'pill-gray'}`}>
                  {telemetry.kettle ? 'Heating' : 'Standby'}
                </span>
                {currentFocus === 'kettle' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setManualFocus('none'); }}
                    className="ios-card-close-btn"
                    title="Dismiss Spotlight"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="timer-box" style={{ position: 'relative', zIndex: 2 }}>
              <div className="timer-digits">
                {telemetry.kettle ? formatTime(telemetry.kettleRem) : '00:00'}
              </div>
              <p className="card-subtitle">
                {telemetry.kettle ? `Heating Profile: ${telemetry.kettleMode}` : 'Select a temperature profile'}
              </p>
            </div>

            <div className="preset-grid" style={{ position: 'relative', zIndex: 2 }}>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('K_TEA'); setManualFocus('kettle'); }}
                className="preset-card"
              >
                <span className="preset-title">Mild Tea</span>
                <span className="preset-time">3 Mins</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('K_COFFEE'); setManualFocus('kettle'); }}
                className="preset-card"
              >
                <span className="preset-title">Coffee</span>
                <span className="preset-time">5 Mins</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('K_BOIL'); setManualFocus('kettle'); }}
                className="preset-card"
              >
                <span className="preset-title">Extra Hot</span>
                <span className="preset-time">8 Mins</span>
              </button>
            </div>

            {telemetry.kettle && (
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('K_OFF'); }}
                className="ios-btn ios-btn-red full-width mt-12"
                style={{ position: 'relative', zIndex: 2 }}
              >
                Stop Kettle
              </button>
            )}
          </div>

          {/* 4. SMART RICE COOKER CARD */}
          <div
            onClick={() => toggleFocus('rice')}
            className={`ios-card full-span rice-card ${
              currentFocus === 'rice' ? 'card-active-focus' : ''
            } ${
              telemetry.riceAlarm
                ? 'rice-done-active'
                : telemetry.rice
                ? 'rice-cooking-active'
                : 'rice-standby-active'
            }`}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {(currentFocus === 'rice' || telemetry.rice || telemetry.riceAlarm) && (
              <div className="rice-simmer-overlay" style={{ overflow: 'hidden' }}>
                <div className="simmer-wave wave-1"></div>
                <div className="simmer-wave wave-2"></div>
                <div className="rice-steam-particles">
                  <span className="rice-particle p1"></span>
                  <span className="rice-particle p2"></span>
                  <span className="rice-particle p3"></span>
                </div>
              </div>
            )}

            <div className="card-header" style={{ position: 'relative', zIndex: 2 }}>
              <div className="card-title-group">
                <span className={`card-icon ${telemetry.rice ? 'rice-cooking-icon' : ''}`}>
                  🍚
                </span>
                <span className="card-title">Smart Rice Cooker</span>
              </div>
              <div className="header-right-actions">
                <span
                  className={`ios-pill ${
                    telemetry.riceAlarm
                      ? 'pill-red-pulse'
                      : telemetry.rice
                      ? 'pill-green'
                      : 'pill-gray'
                  }`}
                >
                  {telemetry.riceAlarm
                    ? 'Rice Ready!'
                    : telemetry.rice
                    ? 'Cooking'
                    : 'Standby'}
                </span>
                {currentFocus === 'rice' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setManualFocus('none'); }}
                    className="ios-card-close-btn"
                    title="Dismiss Spotlight"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="timer-box" style={{ position: 'relative', zIndex: 2 }}>
              <div className="timer-digits">
                {telemetry.rice
                  ? formatTime(telemetry.riceRem)
                  : telemetry.riceAlarm
                  ? '00:00'
                  : '20:00'}
              </div>
              <p className="card-subtitle">
                {telemetry.riceAlarm
                  ? 'Cooking complete! Silence alarm below.'
                  : telemetry.rice
                  ? `Cycle Progress: ${telemetry.ricePct}%`
                  : 'Ready for standard 20-minute cycle'}
              </p>
              <div className="ios-progress-track">
                <div
                  className="ios-progress-fill"
                  style={{
                    width: `${
                      telemetry.riceAlarm ? 100 : telemetry.rice ? telemetry.ricePct : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="ios-btn-row" style={{ position: 'relative', zIndex: 2 }}>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('RICE_START'); setManualFocus('rice'); }}
                className="ios-btn ios-btn-blue flex-1"
              >
                Start Cooking (20m)
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); sendCommand('RICE_OFF'); }}
                className="ios-btn ios-btn-red flex-1"
              >
                Stop / Silence
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}