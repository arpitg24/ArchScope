import React, { useState, useRef, useEffect } from 'react';
import { X, Terminal, Trash2 } from 'lucide-react';

interface TerminalPanelProps {
  onClose: () => void;
  onAddComponent?: (type: string, nodeId?: string, serviceId?: string, label?: string) => void;
  onRemoveNode?: (nodeId: string) => void;
  onConnectNodes?: (sourceId: string, targetId: string, animated?: boolean) => void;
  onDisconnectNodes?: (sourceId: string, targetId: string) => void;
  onRenameNode?: (nodeId: string, label: string) => void;
}

interface LogEntry {
  type: 'command' | 'response' | 'error';
  content: string;
}

export default function TerminalPanel({ onClose, onAddComponent, onRemoveNode, onConnectNodes, onDisconnectNodes, onRenameNode }: TerminalPanelProps) {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([
    { type: 'response', content: 'ArchScope Query Language (AQL) Terminal v1.0.0' },
    { type: 'response', content: 'Type help for available commands' }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldFocusInput, setShouldFocusInput] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const endOfLogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endOfLogRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Restore input focus when needed (single focus management strategy)
  useEffect(() => {
    if (shouldFocusInput && !isProcessing) {
      inputRef.current?.focus();
      setShouldFocusInput(false);
    }
  }, [shouldFocusInput, isProcessing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle ArrowUp - navigate back in history
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      
      const newIndex = historyIndex === -1 ? commandHistory.length - 1 : historyIndex - 1;
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    }
    
    // Handle ArrowDown - navigate forward in history
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      
      const newIndex = historyIndex + 1;
      if (newIndex < commandHistory.length) {
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      } else {
        // Reached the end, clear input
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      const rawCommand = input.trim();
      const normalizedCommand = rawCommand.toLowerCase();
      
      // Add command to history (avoid duplicates)
      if (rawCommand !== commandHistory[commandHistory.length - 1]) {
        setCommandHistory((prev) => [...prev, rawCommand]);
      }
      setHistoryIndex(-1);
      
      setInput('');
      setLogs((prev) => [...prev, { type: 'command', content: rawCommand }]);

      // Handle clear command locally
      if (normalizedCommand === 'clear') {
        setLogs([]);
        setShouldFocusInput(true);
        return;
      }

      // Handle help command locally
      if (normalizedCommand === 'help') {
        setLogs((prev) => [...prev, { type: 'response', content: 'Available commands:' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  add <type> [as <id>] [using <service>] [label "<label>"]' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  remove <node_id>' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  connect <source> to <target> [animated]' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  disconnect <source> from <target>' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  rename <node_id> to "<label>"' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  clear - Clear terminal' }]);
        setLogs((prev) => [...prev, { type: 'response', content: '  help - Show this help' }]);
        setShouldFocusInput(true);
        return;
      }

      // Parse and handle architecture commands locally
      const parts = rawCommand.split(/\s+/);
      const command = parts[0].toLowerCase();
      const hasHelpFlag = parts.includes('--help') || parts.includes('-h');

      // Handle --help flag for commands
      if (hasHelpFlag) {
        if (command === 'add') {
          setLogs((prev) => [...prev, { type: 'response', content: 'Available component types:' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  client - Represents end users or external clients' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  load_balancer - Distributes traffic across multiple instances' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  api_server - Handles API requests and business logic' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  cache - Stores frequently accessed data for faster retrieval' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  database - Stores and manages persistent data' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  message_queue - Asynchronous message processing system' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  worker - Background job processor' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  notification_service - Sends notifications (push, email, etc.)' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '  rate_limiter - Controls request rate to protect downstream services' }]);
          setLogs((prev) => [...prev, { type: 'response', content: '' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Usage: add <component_type> [as <node_id>] [using <service_id>] [label "<label>"]' }]);
        } else if (command === 'remove') {
          setLogs((prev) => [...prev, { type: 'response', content: 'Removes a node and all its connected edges from the architecture.' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Usage: remove <node_id>' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Example: remove api1' }]);
        } else if (command === 'connect') {
          setLogs((prev) => [...prev, { type: 'response', content: 'Creates a directed edge from one node to another.' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Usage: connect <source_id> to <target_id> [animated]' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Example: connect lb to api1 animated' }]);
        } else if (command === 'disconnect') {
          setLogs((prev) => [...prev, { type: 'response', content: 'Removes the edge between two nodes.' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Usage: disconnect <source_id> from <target_id>' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Example: disconnect lb from api1' }]);
        } else if (command === 'rename') {
          setLogs((prev) => [...prev, { type: 'response', content: 'Changes the display label of a node.' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Usage: rename <node_id> to "<new_label>"' }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Example: rename api1 to "Auth API"' }]);
        } else {
          setLogs((prev) => [...prev, { type: 'response', content: `Unknown command: ${command}` }]);
          setLogs((prev) => [...prev, { type: 'response', content: 'Type "help" for available commands' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // add <component_type> [as <node_id>] [using <service_id>] [label "<label>"]
      if (command === 'add') {
        const componentType = parts[1];
        if (!componentType) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: component_type is required for add command' }]);
          setShouldFocusInput(true);
          return;
        }

        let nodeId: string | undefined;
        let serviceId: string | undefined;
        let label: string | undefined;

        let i = 2;
        while (i < parts.length) {
          if (parts[i] === 'as' && parts[i + 1]) {
            nodeId = parts[i + 1];
            i += 2;
          } else if (parts[i] === 'using' && parts[i + 1]) {
            serviceId = parts[i + 1];
            i += 2;
          } else if (parts[i] === 'label' && parts[i + 1]) {
            label = parts[i + 1].replace(/"/g, '');
            i += 2;
          } else {
            i++;
          }
        }

        if (onAddComponent) {
          onAddComponent(componentType, nodeId, serviceId, label);
          setLogs((prev) => [...prev, { type: 'response', content: `Added ${componentType}${nodeId ? ` as ${nodeId}` : ''}` }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // remove <node_id>
      if (command === 'remove') {
        const nodeId = parts[1];
        if (!nodeId) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: node_id is required for remove command' }]);
          setShouldFocusInput(true);
          return;
        }

        if (onRemoveNode) {
          onRemoveNode(nodeId);
          setLogs((prev) => [...prev, { type: 'response', content: `Removed node ${nodeId}` }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // connect <source_id> to <target_id> [animated]
      if (command === 'connect') {
        const sourceId = parts[1];
        const targetIndex = parts.findIndex(p => p.toLowerCase() === 'to');
        const targetId = targetIndex !== -1 ? parts[targetIndex + 1] : undefined;
        const animatedIndex = parts.findIndex(p => p.toLowerCase() === 'animated');

        if (!sourceId || !targetId) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: source_id and target_id are required for connect command' }]);
          setShouldFocusInput(true);
          return;
        }

        const animated = animatedIndex !== -1;

        if (onConnectNodes) {
          onConnectNodes(sourceId, targetId, animated);
          setLogs((prev) => [...prev, { type: 'response', content: `Connected ${sourceId} to ${targetId}${animated ? ' (animated)' : ''}` }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // disconnect <source_id> from <target_id>
      if (command === 'disconnect') {
        const sourceId = parts[1];
        const targetIndex = parts.findIndex(p => p.toLowerCase() === 'from');
        const targetId = targetIndex !== -1 ? parts[targetIndex + 1] : undefined;

        if (!sourceId || !targetId) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: source_id and target_id are required for disconnect command' }]);
          setShouldFocusInput(true);
          return;
        }

        if (onDisconnectNodes) {
          onDisconnectNodes(sourceId, targetId);
          setLogs((prev) => [...prev, { type: 'response', content: `Disconnected ${sourceId} from ${targetId}` }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // rename <node_id> to "<new_label>"
      if (command === 'rename') {
        const nodeId = parts[1];
        const targetIndex = parts.findIndex(p => p.toLowerCase() === 'to');
        const label = targetIndex !== -1 ? parts[targetIndex + 1].replace(/"/g, '') : undefined;

        if (!nodeId || !label) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: node_id and new label are required for rename command' }]);
          setShouldFocusInput(true);
          return;
        }

        if (onRenameNode) {
          onRenameNode(nodeId, label);
          setLogs((prev) => [...prev, { type: 'response', content: `Renamed ${nodeId} to "${label}"` }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // For other commands, send to API
      setIsProcessing(true);

      try {
        const res = await fetch('/api/aql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: rawCommand }),
        });

        const data = await res.json();

        if (res.ok) {
          setLogs((prev) => [...prev, { type: 'response', content: data.message }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: data.error || 'Failed to execute command' }]);
        }
      } catch (error) {
        setLogs((prev) => [...prev, { type: 'error', content: 'Network error or server unreachable' }]);
      } finally {
        setIsProcessing(false);
        setShouldFocusInput(true);
      }
    }
  };

  return (
    <div className="h-72 w-full bg-white text-gray-800 flex flex-col font-mono text-sm border-t border-gray-200 shadow-2xl relative z-50 transition-all duration-300 ease-in-out">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-purple-600" />
          <span className="text-xs uppercase font-bold text-gray-600 tracking-widest select-none">AQL Terminal</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLogs([])}
            className="hover:text-gray-900 text-gray-500 transition-colors flex items-center gap-1 group"
            title="Clear Terminal"
          >
            <Trash2 size={14} className="group-hover:text-red-600 transition-colors" />
          </button>
          <div className="w-px h-4 bg-gray-300"></div>
          <button
            onClick={onClose}
            className="hover:text-gray-900 text-gray-500 transition-colors"
            title="Close Terminal"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5 custom-scrollbar">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 whitespace-pre-wrap break-words">
            {log.type === 'command' && <span className="text-green-600 shrink-0">{'>'}</span>}
            <span className={
              log.type === 'error' ? 'text-red-600' :
              log.type === 'command' ? 'text-gray-900' : 'text-gray-600'
            }>
              {log.content}
            </span>
          </div>
        ))}

        {isProcessing && (
          <div className="text-gray-500 animate-pulse">Processing...</div>
        )}

        <div className="flex gap-2 items-center mt-1">
          <span className="text-green-600 shrink-0">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              handleKeyDown(e);
              handleCommand(e);
            }}
            disabled={isProcessing}
            className="flex-1 bg-transparent outline-none text-gray-900 disabled:opacity-50"
            autoFocus
            autoComplete="off"
            spellCheck="false"
          />
        </div>
        <div ref={endOfLogRef} />
      </div>
    </div>
  );
}
