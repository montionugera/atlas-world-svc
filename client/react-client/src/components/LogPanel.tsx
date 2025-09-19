// Log Panel Component for displaying game logs

import React, { useRef, useEffect } from 'react';

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'mob' | 'player';
  timestamp: Date;
}

interface LogPanelProps {
  logs: LogEntry[];
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);
  
  return (
    <div className="log-panel">
      <div className="log-header">
        <h3>Game Log</h3>
        <span className="log-count">{logs.length} entries</span>
      </div>
      
      <div className="log-container" ref={logContainerRef}>
        {logs.map(log => (
          <div key={log.id} className={`log-entry ${log.type}`}>
            <span className="log-timestamp">
              [{log.timestamp.toLocaleTimeString()}]
            </span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
