import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Terminal, Trash2, Sparkles, RotateCcw } from 'lucide-react';
import { COMPONENT_LABELS } from '@/lib/services';
import { AgentResponse } from '@/hooks/useAgent';

type ComponentType = keyof typeof COMPONENT_LABELS;

type CommandResult = {
  success: boolean;
  message: string;
  pendingConfirmation?: boolean;
  confirmationPrompt?: string;
};

interface TerminalPanelProps {
  onClose: () => void;
  onAddComponent?: (type: string, nodeId?: string, serviceId?: string, label?: string) => CommandResult;
  onRemoveNode?: (label: string) => CommandResult;
  onConnectNodes?: (sourceLabel: string, targetLabel: string, animated?: boolean) => CommandResult;
  onDisconnectNodes?: (sourceLabel: string, targetLabel: string) => CommandResult;
  onRenameNode?: (oldLabel: string, newLabel: string) => CommandResult;
  onShowNodes?: () => { label: string; type: string }[];
  onShowConnections?: () => { source: string; target: string; animated: boolean }[];
  onSetConfig?: (command: string) => Promise<CommandResult>;
  onMultiConfig?: (command: string) => Promise<CommandResult>;
  onResetConfig?: (command: string) => Promise<CommandResult>;
  onAQLCommand?: (command: string) => Promise<CommandResult>;
  onAgentMessage?: (message: string) => Promise<AgentResponse | null>;
  onExecuteAgentCommands?: (commands: string[]) => Promise<{ cmd: string; success: boolean; message: string }[]>;
  agentLoading?: boolean;
  agentError?: string | null;
  onResetAgentSession?: () => void;
  onRegisterLogger?: (logger: (entry: LogEntry) => void) => void;
  height?: number;
}

interface LogEntry {
  type: 'command' | 'response' | 'error' | 'agent' | 'agent-cmd';
  content: string;
}

export default function TerminalPanel({ onClose, onAddComponent, onRemoveNode, onConnectNodes, onDisconnectNodes, onRenameNode, onShowNodes, onShowConnections, onSetConfig, onMultiConfig, onResetConfig, onAQLCommand, onAgentMessage, onExecuteAgentCommands, agentLoading, agentError, onResetAgentSession, onRegisterLogger, height = 288 }: TerminalPanelProps) {
  const [input, setInput] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { type: 'response', content: 'ArchScope Query Language (AQL) Terminal v1.0.0' },
    { type: 'response', content: 'Type help for available commands' }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldFocusInput, setShouldFocusInput] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pendingDeleteConfirmation, setPendingDeleteConfirmation] = useState<string | null>(null);
  const endOfLogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Register logger for parent component to push logs
  useEffect(() => {
    if (onRegisterLogger) {
      onRegisterLogger((entry: LogEntry) => {
        setLogs(prev => [...prev, entry]);
      });
    }
  }, [onRegisterLogger]);

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

  const executeAQLCommand = useCallback(async (cmd: string): Promise<CommandResult> => {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    if (command === 'add') {
      const componentType = parts[1];
      const asIndex = parts.findIndex(p => p.toLowerCase() === 'as');
      const name = asIndex !== -1 ? parts[asIndex + 1] : undefined;
      const usingIndex = parts.findIndex(p => p.toLowerCase() === 'using');
      const serviceId = usingIndex !== -1 ? parts[usingIndex + 1] : undefined;
      if (!componentType || !name) return { success: false, message: `Invalid add command: ${cmd}` };
      if (onAddComponent) return onAddComponent(componentType, undefined, serviceId, name);
      return { success: false, message: 'Architecture commands not available' };
    }
    if (command === 'remove') {
      if (onRemoveNode && parts[1]) return onRemoveNode(parts[1]);
      return { success: false, message: `Invalid remove command: ${cmd}` };
    }
    if (command === 'connect') {
      const source = parts[1];
      const toIdx = parts.findIndex(p => p.toLowerCase() === 'to');
      const target = toIdx !== -1 ? parts[toIdx + 1] : undefined;
      const animated = parts.some(p => p.toLowerCase() === 'animated');
      if (onConnectNodes && source && target) return onConnectNodes(source, target, animated);
      return { success: false, message: `Invalid connect command: ${cmd}` };
    }
    if (command === 'disconnect') {
      const source = parts[1];
      const fromIdx = parts.findIndex(p => p.toLowerCase() === 'from');
      const target = fromIdx !== -1 ? parts[fromIdx + 1] : undefined;
      if (onDisconnectNodes && source && target) return onDisconnectNodes(source, target);
      return { success: false, message: `Invalid disconnect command: ${cmd}` };
    }
    if (command === 'rename') {
      const oldName = parts[1];
      const toIdx = parts.findIndex(p => p.toLowerCase() === 'to');
      const newName = toIdx !== -1 ? parts[toIdx + 1] : undefined;
      if (onRenameNode && oldName && newName) return onRenameNode(oldName, newName);
      return { success: false, message: `Invalid rename command: ${cmd}` };
    }
    if (command === 'set' && onSetConfig) return onSetConfig(cmd);
    if (command === 'config' && onMultiConfig) return onMultiConfig(cmd);
    if (command === 'reset' && parts[1]?.toLowerCase() === 'config' && onResetConfig) return onResetConfig(cmd);
    if (onAQLCommand) return onAQLCommand(cmd);
    return { success: false, message: `Unknown command: ${cmd}` };
  }, [onAddComponent, onRemoveNode, onConnectNodes, onDisconnectNodes, onRenameNode, onSetConfig, onMultiConfig, onResetConfig, onAQLCommand]);

  const handleAgentInput = useCallback(async (message: string) => {
    if (!onAgentMessage) {
      setLogs(prev => [...prev, { type: 'error', content: 'AI agent is not configured. Please set up the API route and API key.' }]);
      return;
    }

    setLogs(prev => [...prev, { type: 'command', content: message }]);
    setIsProcessing(true);

    const response = await onAgentMessage(message);

    if (!response) {
      setLogs(prev => [...prev, { type: 'error', content: agentError || 'Agent request failed' }]);
      setIsProcessing(false);
      setShouldFocusInput(true);
      return;
    }

    if (response.type === 'clarification') {
      setLogs(prev => [
        ...prev,
        { type: 'agent', content: response.summary },
        ...response.questions.map((q, i) => ({
          type: 'agent' as const,
          content: `  ${i + 1}. ${q}`,
        })),
      ]);
      setIsProcessing(false);
      setShouldFocusInput(true);
      return;
    }

    if (response.type === 'execution') {
      setLogs(prev => [
        ...prev,
        { type: 'agent', content: response.explanation },
        { type: 'agent', content: `Executing ${response.commands.length} AQL commands...` },
      ]);

      let successCount = 0;
      let failCount = 0;

      if (onExecuteAgentCommands) {
        const results = await onExecuteAgentCommands(response.commands);
        for (const r of results) {
          setLogs(prev => [
            ...prev,
            { type: 'agent-cmd', content: `> ${r.cmd}` },
            { type: r.success ? 'response' : 'error', content: `  ${r.message}` },
          ]);
          if (r.success) successCount++; else failCount++;
        }
      } else {
        for (const cmd of response.commands) {
          setLogs(prev => [...prev, { type: 'agent-cmd', content: `> ${cmd}` }]);
          const result = await executeAQLCommand(cmd);
          setLogs(prev => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: `  ${result.message}` },
          ]);
          if (result.success) successCount++; else failCount++;
          await new Promise(r => setTimeout(r, 120));
        }
      }

      if (failCount > 0) {
        setLogs(prev => [...prev, { type: 'error', content: `${failCount} command(s) failed. ${successCount} succeeded. You can fix issues manually or ask me to retry.` }]);
      } else {
        setLogs(prev => [...prev, { type: 'agent', content: 'Done. You can refine — e.g. "add a cache" or "make it cheaper".' }]);
      }
      setIsProcessing(false);
      setShouldFocusInput(true);
      return;
    }
  }, [onAgentMessage, agentError, executeAQLCommand, onExecuteAgentCommands]);

  const toggleAiMode = useCallback(() => {
    setAiMode(prev => !prev);
  }, []);

  useEffect(() => {
    if (aiMode) {
      setLogs(prev => [
        ...prev,
        { type: 'agent', content: 'AI Mode activated. Describe what you want to build in plain English.' },
        { type: 'agent', content: 'Try: "build a URL shortener backend" or "read-heavy API with caching"' },
      ]);
    }
    // Only fire the "switched back" message after the initial render
    if (!aiMode && logs.some(l => l.type === 'agent')) {
      setLogs(prev => [
        ...prev,
        { type: 'response', content: 'Switched back to AQL mode.' },
      ]);
    }
    setShouldFocusInput(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode]);

  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      const rawCommand = input.trim();

      if (aiMode) {
        setInput('');
        if (rawCommand !== commandHistory[commandHistory.length - 1]) {
          setCommandHistory(prev => [...prev, rawCommand]);
        }
        setHistoryIndex(-1);
        await handleAgentInput(rawCommand);
        return;
      }

      const normalizedCommand = rawCommand.toLowerCase();
      const parts = rawCommand.split(/\s+/);

      // Handle delete confirmation - only accept confirmation, reject other commands
      if (pendingDeleteConfirmation) {
        const confirmation = input.trim().toLowerCase();
        console.log('Delete confirmation triggered:', confirmation, 'for preset:', pendingDeleteConfirmation);
        // Add to logs for confirmation response
        setLogs((prev) => [...prev, { type: 'command', content: rawCommand }]);
        setInput('');

        if (confirmation === 'y' || confirmation === 'yes') {
          // User confirmed, execute delete with confirmation flag
          if (onAQLCommand) {
            const result = await onAQLCommand(`delete_preset ${pendingDeleteConfirmation}`);
            const logType = result.success ? 'response' : 'error';
            setLogs((prev) => [...prev, { type: logType, content: result.message }]);
          }
        } else {
          // User cancelled (any input other than y/yes cancels)
          setLogs((prev) => [...prev, { type: 'response', content: 'Deletion cancelled' }]);
        }
        setPendingDeleteConfirmation(null);
        setShouldFocusInput(true);
        return;
      }

      // Add command to history (avoid duplicates)
      if (rawCommand !== commandHistory[commandHistory.length - 1]) {
        setCommandHistory((prev) => [...prev, rawCommand]);
      }
      setHistoryIndex(-1);

      setInput('');
      setLogs((prev) => [...prev, { type: 'command', content: rawCommand }]);

      // Handle delete confirmation
      if (pendingDeleteConfirmation) {
        const confirmation = input.trim().toLowerCase();
        if (confirmation === 'y' || confirmation === 'yes') {
          // User confirmed, execute delete with confirmation flag
          if (onAQLCommand) {
            const result = await onAQLCommand(`delete_preset ${pendingDeleteConfirmation}`);
            const logType = result.success ? 'response' : 'error';
            setLogs((prev) => [...prev, { type: logType, content: result.message }]);
          }
        } else {
          // User cancelled
          setLogs((prev) => [...prev, { type: 'response', content: 'Deletion cancelled' }]);
        }
        setPendingDeleteConfirmation(null);
        setShouldFocusInput(true);
        return;
      }

      // Handle clear command locally
      if (normalizedCommand === 'clear') {
        setLogs([]);
        setShouldFocusInput(true);
        return;
      }

      // Handle help command locally
      if (normalizedCommand === 'help') {
        setLogs((prev) => [
          ...prev,
          { type: 'response', content: 'Available commands:' },
          { type: 'response', content: 'Architecture:' },
          { type: 'response', content: '  add <type> as <name> [using <service_id>]' },
          { type: 'response', content: '  remove <name>' },
          { type: 'response', content: '  connect <source> to <target> [animated]' },
          { type: 'response', content: '  disconnect <source> from <target>' },
          { type: 'response', content: '  rename <name> to <new_name>' },
          { type: 'response', content: 'Configuration:' },
          { type: 'response', content: '  set <label> <property> = <value>' },
          { type: 'response', content: '  config <label> { <property>: <value>, ... }' },
          { type: 'response', content: '  reset config <label>' },
          { type: 'response', content: 'Simulation:' },
          { type: 'response', content: '  sim_set <property> = <value>' },
          { type: 'response', content: '  sim_config { <property>: <value>, ... }' },
          { type: 'response', content: '  sim_run [property=value ...]' },
          { type: 'response', content: '  sim_stop' },
          { type: 'response', content: '  sim_reset' },
          { type: 'response', content: 'Query:' },
          { type: 'response', content: '  show_nodes - List all nodes' },
          { type: 'response', content: '  show_connections - List all connections' },
          { type: 'response', content: '  show_sim [status|config]' },
          { type: 'response', content: '  show_metrics [latency|throughput|errors]' },
          { type: 'response', content: '  show_bottlenecks' },
          { type: 'response', content: '  show_services [component_type] - List available cloud services' },
          { type: 'response', content: 'Canvas:' },
          { type: 'response', content: '  zoom_in - Zoom in on the canvas' },
          { type: 'response', content: '  zoom_out - Zoom out on the canvas' },
          { type: 'response', content: '  fit_view - Fit canvas to view' },
          { type: 'response', content: 'Preset:' },
          { type: 'response', content: '  load_preset <preset_name>' },
          { type: 'response', content: '  save_preset <preset_name> [as "<description>"]' },
          { type: 'response', content: '  delete_preset <preset_name>' },
          { type: 'response', content: '  list_preset' },
          { type: 'response', content: 'Other:' },
          { type: 'response', content: '  clear - Clear terminal' },
          { type: 'response', content: '  help - Show this help' },
        ]);
        setShouldFocusInput(true);
        return;
      }

      // Handle show_nodes command locally
      if (normalizedCommand === 'show_nodes') {
        if (onShowNodes) {
          const nodes = onShowNodes();
          if (nodes.length === 0) {
            setLogs((prev) => [...prev, { type: 'response', content: 'No nodes in the architecture' }]);
          } else {
            const nodeEntries = nodes.map((node) => ({
              type: 'response' as const,
              content: `  ${node.label} (${node.type})`,
            }));
            setLogs((prev) => [
              ...prev,
              { type: 'response', content: 'Nodes in architecture:' },
              ...nodeEntries,
            ]);
          }
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Unable to list nodes' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // Handle show_connections command locally
      if (normalizedCommand === 'show_connections') {
        if (onShowConnections) {
          const connections = onShowConnections();
          if (connections.length === 0) {
            setLogs((prev) => [...prev, { type: 'response', content: 'No connections in the architecture' }]);
          } else {
            const connectionEntries = connections.map((conn) => ({
              type: 'response' as const,
              content: `  ${conn.source} -> ${conn.target}${conn.animated ? ' (animated)' : ''}`,
            }));
            setLogs((prev) => [
              ...prev,
              { type: 'response', content: 'Connections in architecture:' },
              ...connectionEntries,
            ]);
          }
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Unable to list connections' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      const command = parts[0].toLowerCase();
      const hasHelpFlag = parts.includes('--help') || parts.includes('-h');

      // Handle list_preset command locally
      if (command === 'list_preset') {
        if (onAQLCommand) {
          const result = await onAQLCommand(input);
          const logType = result.success ? 'response' : 'error';
          setLogs((prev) => [...prev, { type: logType, content: result.message }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Unable to list presets' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // Handle show_services command
      if (command === 'show_services') {
        if (onAQLCommand) {
          const result = await onAQLCommand(input);
          const logType = result.success ? 'response' : 'error';
          setLogs((prev) => [...prev, { type: logType, content: result.message }]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Unable to show services' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // Handle --help flag for commands
      if (hasHelpFlag) {
        if (command === 'add') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Available component types:' },
            { type: 'response', content: '  client - Represents end users or external clients' },
            { type: 'response', content: '  load_balancer - Distributes traffic across multiple instances' },
            { type: 'response', content: '  api_server - Handles API requests and business logic' },
            { type: 'response', content: '  cache - Stores frequently accessed data for faster retrieval' },
            { type: 'response', content: '  database - Stores and manages persistent data' },
            { type: 'response', content: '  message_queue - Asynchronous message processing system' },
            { type: 'response', content: '  worker - Background job processor' },
            { type: 'response', content: '  notification_service - Sends notifications (push, email, etc.)' },
            { type: 'response', content: '  rate_limiter - Controls request rate to protect downstream services' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Usage: add <component_type> as <name> [using <service_id>]' },
            { type: 'response', content: '' },
            { type: 'response', content: 'To see available services, use: show_services [component_type]' },
          ]);
        } else if (command === 'show_services') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Lists available cloud services from the service catalog.' },
            { type: 'response', content: 'Usage: show_services [component_type]' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  show_services - Show all available services' },
            { type: 'response', content: '  show_services api_server - Show only API server services' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Use the service_id with the add command:' },
            { type: 'response', content: '  add api_server as api1 using ec2_c5_xlarge' },
          ]);
        } else if (command === 'remove') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Removes a node and all its connected edges from the architecture.' },
            { type: 'response', content: 'Usage: remove <name>' },
            { type: 'response', content: 'Example: remove api1' },
          ]);
        } else if (command === 'connect') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Creates a directed edge from one node to another.' },
            { type: 'response', content: 'Usage: connect <source> to <target> [animated]' },
            { type: 'response', content: 'Example: connect api1 to db animated' },
          ]);
        } else if (command === 'disconnect') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Removes the edge between two nodes.' },
            { type: 'response', content: 'Usage: disconnect <source> from <target>' },
            { type: 'response', content: 'Example: disconnect api1 from db' },
          ]);
        } else if (command === 'rename') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Changes the display label of a node.' },
            { type: 'response', content: 'Usage: rename <name> to <new_name>' },
            { type: 'response', content: 'Example: rename api1 to auth_api' },
          ]);
        } else if (command === 'load_preset') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Loads a saved architecture preset and replaces the current architecture.' },
            { type: 'response', content: 'Usage: load_preset <preset_name>' },
            { type: 'response', content: 'Example: load_preset demo' },
          ]);
        } else if (command === 'save_preset') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Saves the current architecture as a new preset.' },
            { type: 'response', content: 'Usage: save_preset <preset_name> [as "<description>"]' },
            { type: 'response', content: 'Example: save_preset my_api as "My custom API architecture"' },
          ]);
        } else if (command === 'delete_preset') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Deletes a user-created preset with confirmation.' },
            { type: 'response', content: 'Usage: delete_preset <preset_name>' },
            { type: 'response', content: 'Example: delete_preset my_api' },
            { type: 'response', content: 'Note: Built-in presets cannot be deleted' },
          ]);
        } else if (command === 'list_preset') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Lists all available presets with detailed information.' },
            { type: 'response', content: 'Usage: list_preset' },
          ]);
        } else if (command === 'set') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Sets a single property on a node.' },
            { type: 'response', content: 'Usage: set <label> <property> = <value>' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Available properties:' },
            { type: 'response', content: '  latency - Override base latency (ms)' },
            { type: 'response', content: '  maxRps - Override max requests/second' },
            { type: 'response', content: '  cost - Override cost per hour ($)' },
            { type: 'response', content: '  hitRate - Cache hit rate (0-1, for cache)' },
            { type: 'response', content: '  ttl - Cache TTL in seconds (for cache)' },
            { type: 'response', content: '  maxMessages - Max queue depth (for message_queue)' },
            { type: 'response', content: '  processingTime - Processing time per message (ms, for message_queue)' },
            { type: 'response', content: '  algorithm - Rate limit algorithm (for rate_limiter)' },
            { type: 'response', content: '  bucketSize - Token bucket size (for rate_limiter)' },
            { type: 'response', content: '  refillRate - Token refill rate (for rate_limiter)' },
            { type: 'response', content: '  windowSeconds - Window duration (for rate_limiter)' },
            { type: 'response', content: '  maxRequests - Max requests per window (for rate_limiter)' },
            { type: 'response', content: '  redisCounterTtl - Redis counter TTL (for rate_limiter)' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  set api1 latency = 20' },
            { type: 'response', content: '  set redis1 hitRate = 0.90' },
            { type: 'response', content: '  set rl algorithm = token_bucket' },
          ]);
        } else if (command === 'config') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Sets multiple properties on a node in a single block.' },
            { type: 'response', content: 'Usage: config <label> { <property>: <value>, ... }' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  config rl {' },
            { type: 'response', content: '    algorithm: token_bucket,' },
            { type: 'response', content: '    bucketSize: 500,' },
            { type: 'response', content: '    refillRate: 100' },
            { type: 'response', content: '  }' },
            { type: 'response', content: '' },
            { type: 'response', content: '  config redis1 {' },
            { type: 'response', content: '    hitRate: 0.85,' },
            { type: 'response', content: '    ttl: 600' },
            { type: 'response', content: '  }' },
          ]);
        } else if (command === 'reset' && parts[1]?.toLowerCase() === 'config') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Resets a node\'s config to its service defaults.' },
            { type: 'response', content: 'Usage: reset config <label>' },
            { type: 'response', content: 'Example: reset config api1' },
          ]);
        } else if (command === 'sim_set') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Sets a single simulation parameter.' },
            { type: 'response', content: 'Usage: sim_set <property> = <value>' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Available properties:' },
            { type: 'response', content: '  duration - Simulation duration in seconds (must be > 0)' },
            { type: 'response', content: '  load_per_user - Requests per second per user (must be > 0)' },
            { type: 'response', content: '  clients - Number of concurrent clients (must be > 0)' },
            { type: 'response', content: '  payload_size - Payload size in MB (must be > 0)' },
            { type: 'response', content: '  load_profile - Load pattern: constant, sine, or repeating_spike' },
            { type: 'response', content: '  spike_frequency - Spikes per simulation (1-10, only for repeating_spike)' },
            { type: 'response', content: '  spike_intensity - Peak multiplier (1.5-5x, only for repeating_spike)' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  sim_set duration = 300' },
            { type: 'response', content: '  sim_set load_per_user = 10' },
            { type: 'response', content: '  sim_set payload_size = 0.5' },
            { type: 'response', content: '  sim_set load_profile = repeating_spike' },
            { type: 'response', content: '  sim_set spike_frequency = 5' },
          ]);
        } else if (command === 'sim_config') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Sets multiple simulation parameters in a single block.' },
            { type: 'response', content: 'Usage: sim_config { <property>: <value>, ... }' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  sim_config {' },
            { type: 'response', content: '    duration: 600,' },
            { type: 'response', content: '    load_per_user: 10,' },
            { type: 'response', content: '    clients: 500,' },
            { type: 'response', content: '    payload_size: 0.5,' },
            { type: 'response', content: '    load_profile: sine' },
            { type: 'response', content: '  }' },
            { type: 'response', content: '' },
            { type: 'response', content: '  sim_config {' },
            { type: 'response', content: '    duration: 300,' },
            { type: 'response', content: '    load_per_user: 5,' },
            { type: 'response', content: '    load_profile: repeating_spike,' },
            { type: 'response', content: '    spike_frequency: 4,' },
            { type: 'response', content: '    spike_intensity: 3' },
            { type: 'response', content: '  }' },
          ]);
        } else if (command === 'sim_run') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Executes a simulation with current configuration or optional overrides.' },
            { type: 'response', content: 'Usage: sim_run [property=value ...]' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  sim_run                    -- Run with current settings' },
            { type: 'response', content: '  sim_run duration=300       -- Override duration for this run' },
            { type: 'response', content: '  sim_run load=2000 algorithm=burst  -- Multiple overrides' },
          ]);
        } else if (command === 'sim_stop') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Stops a currently running simulation.' },
            { type: 'response', content: 'Usage: sim_stop' },
          ]);
        } else if (command === 'sim_reset') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Resets simulation configuration to defaults.' },
            { type: 'response', content: 'Usage: sim_reset' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Default configuration:' },
            { type: 'response', content: '  Duration: 300 seconds' },
            { type: 'response', content: '  Load: 1000 RPS' },
            { type: 'response', content: '  Clients: 100' },
            { type: 'response', content: '  Ramp-up: 30 seconds' },
            { type: 'response', content: '  Algorithm: random' },
          ]);
        } else if (command === 'show_sim') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Displays current simulation configuration or status.' },
            { type: 'response', content: 'Usage: show_sim [status|config]' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  show_sim                   -- Show current configuration' },
            { type: 'response', content: '  show_sim status            -- Show running status' },
            { type: 'response', content: '  show_sim config            -- Show configuration (default)' },
          ]);
        } else if (command === 'show_metrics') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Displays simulation results and performance metrics.' },
            { type: 'response', content: 'Usage: show_metrics [latency|throughput|errors]' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Examples:' },
            { type: 'response', content: '  show_metrics               -- Show all metrics' },
            { type: 'response', content: '  show_metrics latency       -- Show latency metrics only' },
            { type: 'response', content: '  show_metrics throughput    -- Show throughput metrics only' },
            { type: 'response', content: '  show_metrics errors        -- Show error metrics only' },
          ]);
        } else if (command === 'show_bottlenecks') {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: 'Identifies and displays performance bottlenecks from simulation results.' },
            { type: 'response', content: 'Usage: show_bottlenecks' },
            { type: 'response', content: '' },
            { type: 'response', content: 'Shows:' },
            { type: 'response', content: '  High utilization nodes' },
            { type: 'response', content: '  High latency nodes' },
            { type: 'response', content: '  Severity levels: Low, Medium, High, Critical' },
          ]);
        } else {
          setLogs((prev) => [
            ...prev,
            { type: 'response', content: `Unknown command: ${command}` },
            { type: 'response', content: 'Type "help" for available commands' },
          ]);
        }
        setShouldFocusInput(true);
        return;
      }

      // add <component_type> as <name> [using <service_id>]
      if (command === 'add') {
        const componentType = parts[1];
        if (!componentType) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: component_type is required for add command' }]);
          setShouldFocusInput(true);
          return;
        }

        const asIndex = parts.findIndex(p => p.toLowerCase() === 'as');
        const name = asIndex !== -1 ? parts[asIndex + 1] : undefined;

        if (!name) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: name is required for add command' }]);
          setShouldFocusInput(true);
          return;
        }

        // Parse optional "using <service_id>" clause
        const usingIndex = parts.findIndex(p => p.toLowerCase() === 'using');
        const serviceId = usingIndex !== -1 ? parts[usingIndex + 1] : undefined;

        if (onAddComponent) {
          const result = onAddComponent(componentType, undefined, serviceId, name);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // remove <name>
      if (command === 'remove') {
        const name = parts[1];
        if (!name) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: name is required for remove command' }]);
          setShouldFocusInput(true);
          return;
        }

        if (onRemoveNode) {
          const result = onRemoveNode(name);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // connect <source> to <target> [animated]
      if (command === 'connect') {
        const source = parts[1];
        const targetIndex = parts.findIndex(p => p.toLowerCase() === 'to');
        const target = targetIndex !== -1 ? parts[targetIndex + 1] : undefined;
        const animatedIndex = parts.findIndex(p => p.toLowerCase() === 'animated');

        if (!source || !target) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: source and target are required for connect command' }]);
          setShouldFocusInput(true);
          return;
        }

        const animated = animatedIndex !== -1;

        if (onConnectNodes) {
          const result = onConnectNodes(source, target, animated);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // disconnect <source> from <target>
      if (command === 'disconnect') {
        const source = parts[1];
        const targetIndex = parts.findIndex(p => p.toLowerCase() === 'from');
        const target = targetIndex !== -1 ? parts[targetIndex + 1] : undefined;

        if (!source || !target) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: source and target are required for disconnect command' }]);
          setShouldFocusInput(true);
          return;
        }

        if (onDisconnectNodes) {
          const result = onDisconnectNodes(source, target);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // rename <name> to <new_name>
      if (command === 'rename') {
        const oldName = parts[1];
        const targetIndex = parts.findIndex(p => p.toLowerCase() === 'to');
        const newName = targetIndex !== -1 ? parts[targetIndex + 1] : undefined;

        if (!oldName || !newName) {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: old name and new name are required for rename command' }]);
          setShouldFocusInput(true);
          return;
        }

        if (onRenameNode) {
          const result = onRenameNode(oldName, newName);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Architecture commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // set <node_id> <property> = <value>
      if (command === 'set') {
        if (onSetConfig) {
          const result = await onSetConfig(rawCommand);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Configuration commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // config <node_id> { <property>: <value>, ... }
      if (command === 'config') {
        if (onMultiConfig) {
          const result = await onMultiConfig(rawCommand);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Configuration commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // reset config <node_id>
      if (command === 'reset' && parts[1]?.toLowerCase() === 'config') {
        if (onResetConfig) {
          const result = await onResetConfig(rawCommand);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Configuration commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // Handle canvas zoom/view commands locally
      if (command === 'zoom_in' || command === 'zoom_out' || command === 'fit_view') {
        if (onAQLCommand) {
          const result = await onAQLCommand(rawCommand);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Canvas commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // Handle simulation commands locally
      if (command.startsWith('sim_') || command === 'show_sim' || command === 'show_metrics' || command === 'show_bottlenecks') {
        if (onAQLCommand) {
          const result = await onAQLCommand(rawCommand);
          setLogs((prev) => [
            ...prev,
            { type: result.success ? 'response' : 'error', content: result.message },
          ]);
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Simulation commands not available' }]);
        }
        setShouldFocusInput(true);
        return;
      }

      // Handle preset commands locally
      if (command === 'load_preset' || command === 'save_preset' || command === 'delete_preset') {
        if (onAQLCommand) {
          const result = await onAQLCommand(rawCommand);
          
          // Check if this is a delete confirmation request
          if (result.pendingConfirmation && result.confirmationPrompt) {
            // Extract preset name from confirmation prompt
            const presetName = result.confirmationPrompt.replace('delete_preset ', '');
            console.log('Setting pendingDeleteConfirmation to:', presetName);
            setPendingDeleteConfirmation(presetName);
            setLogs((prev) => [...prev, { type: 'response', content: result.message }]);
          } else {
            setLogs((prev) => [
              ...prev,
              { type: result.success ? 'response' : 'error', content: result.message },
            ]);
          }
        } else {
          setLogs((prev) => [...prev, { type: 'error', content: 'Error: Preset commands not available' }]);
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
    <div 
      className="w-full bg-white text-gray-800 flex flex-col font-mono text-sm border-t border-gray-200 shadow-2xl relative z-50 transition-all duration-300 ease-in-out" 
      style={{ height: `${height}px` }}
    >
      {/* Terminal Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b transition-colors duration-200 ${
        aiMode ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-2">
          {aiMode ? (
            <Sparkles size={14} className="text-indigo-600" />
          ) : (
            <Terminal size={14} className="text-purple-600" />
          )}
          <span className={`text-xs uppercase font-bold tracking-widest select-none ${
            aiMode ? 'text-indigo-600' : 'text-gray-600'
          }`}>
            {aiMode ? 'AI Agent' : 'AQL Terminal'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAiMode}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition-all duration-200 ${
              aiMode
                ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 border border-gray-200'
            }`}
            title={aiMode ? 'Switch to AQL mode' : 'Switch to AI mode'}
          >
            <Sparkles size={12} />
            {aiMode ? 'AI ON' : 'AI'}
          </button>
          {aiMode && onResetAgentSession && (
            <button
              onClick={() => {
                onResetAgentSession();
                setLogs(prev => [...prev, { type: 'agent', content: 'Session reset. Starting a new conversation.' }]);
                setShouldFocusInput(true);
              }}
              className="hover:text-indigo-700 text-indigo-400 transition-colors"
              title="New AI conversation"
            >
              <RotateCcw size={14} />
            </button>
          )}
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
            {log.type === 'command' && <span className={aiMode ? 'text-indigo-500 shrink-0' : 'text-green-600 shrink-0'}>{'>'}</span>}
            {log.type === 'agent-cmd' && <span className="text-purple-500 shrink-0">{'$'}</span>}
            <span className={
              log.type === 'error' ? 'text-red-600' :
              log.type === 'command' ? 'text-gray-900' :
              log.type === 'agent' ? 'text-indigo-700' :
              log.type === 'agent-cmd' ? 'text-purple-600 font-mono text-xs' :
              'text-gray-600'
            }>
              {log.content}
            </span>
          </div>
        ))}

        {(isProcessing || agentLoading) && (
          <div className={`flex items-center gap-2 ${aiMode ? 'text-indigo-500' : 'text-gray-500'}`}>
            <span>{aiMode ? 'Agent is thinking' : 'Processing'}</span>
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {pendingDeleteConfirmation && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            ⚠️ Confirm deletion: Type <span className="font-semibold">Y</span> to confirm or any other key to cancel
          </div>
        )}

        {pendingDeleteConfirmation && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            ⚠️ Confirm deletion: Type <span className="font-semibold">Y</span> to confirm or any other key to cancel
          </div>
        )}

        <div className="flex gap-2 items-center mt-1">
          <span className={`shrink-0 ${aiMode ? 'text-indigo-500' : 'text-green-600'}`}>{aiMode ? '~' : '>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              // When waiting for confirmation, only allow single character input
              if (pendingDeleteConfirmation) {
                const value = e.target.value.trim();
                if (value.length > 1) {
                  return;
                }
                setInput(value);
              } else {
                setInput(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              handleKeyDown(e);
              handleCommand(e);
            }}
            disabled={isProcessing}
<<<<<<< HEAD
            placeholder={pendingDeleteConfirmation ? 'Type Y to confirm...' : aiMode ? 'Describe what you want to build...' : ''}
=======
            placeholder={pendingDeleteConfirmation ? 'Type Y to confirm...' : ''}
>>>>>>> caa4896530fa7fd17e571ddf82f1a1af7a3db3c1
            className="flex-1 bg-transparent outline-none text-gray-900 disabled:opacity-50 placeholder:text-gray-400"
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
