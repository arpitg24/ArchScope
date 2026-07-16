'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { SimulationNodeData, SimulationParams, SimulationResult } from '@/types';
import { PRESETS } from '@/data';
import { COMPONENT_LABELS, COMPONENT_DEFAULTS } from '@/lib/services';

import SimulationControls from '@/components/features/simulator/simulation-controls';
import SimulatorHeader from './simulator-header';
import DiagramCanvas from './diagram-canvas';
import RightSidebar from './right-sidebar';

import { useResizable } from './hooks/useResizable';
import { useSimulatorState } from './hooks/useSimulatorState';
import { useSimulation } from './hooks/useSimulation';
import { useSelection } from './hooks/useSelection';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useNodeEvents } from './hooks/useNodeEvents';
import { useDesigns } from '@/hooks/useDesigns';
import SaveModal from './save-modal';
import CanvasTopBar from './canvas-topbar';
import SimulationTopBar from './simulation-topbar';
import TerminalPanel from './terminal-panel';
import { parseAQLCommand } from '@/lib/aql/parser';
import { executeConfigCommand } from '@/lib/aql/handlers';
import { useAgent } from '@/hooks/useAgent';

export default function Simulator() {
  // Local State
  const [rightTab, setRightTab] = useState('components');
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [currentDesignName, setCurrentDesignName] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // AI Agent
  const { isLoading: agentLoading, error: agentError, sendMessage: agentSendMessage, evaluateResults: agentEvaluateResults, resetSession: agentResetSession } = useAgent();
  const agentTriggeredSimRef = React.useRef(false);
  const [pendingEvaluation, setPendingEvaluation] = React.useState(false);
  const terminalLogRef = React.useRef<((entry: { type: 'command' | 'response' | 'error' | 'agent' | 'agent-cmd'; content: string }) => void) | null>(null);
  const executeAgentCommandsRef = React.useRef<((commands: string[]) => Promise<{ cmd: string; success: boolean; message: string }[]>) | null>(null);
  

  // Custom Hooks - State Management
  const simulatorState = useSimulatorState();
  const {
    nodes,
    edges,
    selectedNode,
    selectedEdge,
    selectedNodes,
    simulationParams,
    reactFlowRef,
    onNodesChange,
    onEdgesChange,
    setNodes,
    setEdges,
    addComponent,
    updateNode,
    deleteNode,
    setSelectedNode,
    setSelectedEdge,
    setSelectedNodes,
    setSimulationParams,
    undo,
    redo,
    copy,
    paste,
    saveToHistory,
  } = simulatorState;

  const {
    saveDesign,
    loadDesign,
    currentDesignId,
    clearCurrentDesign
  } = useDesigns(nodes, edges);

  // Custom Hooks - Simulation Logic
  const simulation = useSimulation(nodes, edges, simulationParams, setNodes);
  const {
    simulationResult,
    setSimulationResult,
    isRunning,
    simProgress,
    liveTimeSeries,
    handleRunSimulation,
    stopSimulation,
    handleReset,
    handleFastForward,
  } = simulation;

  // Switch to report tab when simulation starts
  useEffect(() => {
    if (isRunning) {
      setRightTab('report');
    }
  }, [isRunning, setRightTab]);

  // Monitor UI simulation completion and update AQL simulation state
  useEffect(() => {
    // When simulation stops and we have results, update the AQL simulation state
    if (!isRunning && simulationResult && simulationResult.totalRequests > 0) {
      
      // Update the global simulation state directly
      const aqlResults = {
        id: `sim_${Date.now()}`,
        timestamp: new Date(),
        config: {
          duration: simulationParams.simulationDurationSeconds || 300,
          load_per_user: simulationParams.requestsPerSecPerUser || 10,
          clients: simulationParams.concurrentUsers || 100,
          payload_size: simulationParams.payloadSizeMB || 0.001,
          load_profile: simulationParams.loadProfile || 'constant',
          spike_frequency: simulationParams.spikeFrequency || 3,
          spike_intensity: simulationParams.spikeIntensity || 2
        },
        totalRequests: simulationResult.totalRequests,
        successfulRequests: simulationResult.successfulRequests,
        failedRequests: simulationResult.failedRequests,
        averageLatency: simulationResult.avgEndToEndLatencyMs,
        p95Latency: simulationResult.p99EndToEndLatencyMs,
        p99Latency: simulationResult.p99EndToEndLatencyMs,
        throughput: simulationResult.actualThroughputRps,
        errorRate: simulationResult.failedRequests / (simulationResult.totalRequests || 1),
        nodeMetrics: {},
        bottlenecks: simulationResult.bottlenecks || [],
        duration: simulationParams.simulationDurationSeconds || 300
      };
      
      (window as any).simulationState = {
        isRunning: false,
        currentResults: aqlResults,
        resultsHistory: [aqlResults]
      };

      // Auto-evaluate if simulation was triggered by agent
      if (agentTriggeredSimRef.current) {
        agentTriggeredSimRef.current = false;
        setPendingEvaluation(true);
      }
    }
  }, [isRunning, simulationResult]);

  // Auto-evaluate simulation results when pending
  useEffect(() => {
    if (!pendingEvaluation || !simulationResult || agentLoading) return;
    setPendingEvaluation(false);

    const runEvaluation = async (refinementRound = 0) => {
      const MAX_REFINEMENTS = 2;
      const log = terminalLogRef.current;
      if (log) log({ type: 'agent', content: `Evaluating simulation results against your requirements...` });

      const evalResult = await agentEvaluateResults(simulationResult, nodes, edges);

      if (!evalResult) {
        if (log) log({ type: 'error', content: 'Failed to evaluate simulation results.' });
        return;
      }

      if (log) log({ type: 'agent', content: evalResult.evaluationSummary });

      if (evalResult.type === 'pass') {
        if (log) log({ type: 'agent', content: '✓ Architecture meets your requirements!' });
        return;
      }

      // Refinement needed
      if (refinementRound >= MAX_REFINEMENTS) {
        if (log) log({ type: 'agent', content: `Reached max refinement attempts (${MAX_REFINEMENTS}). You can continue refining manually.` });
        return;
      }

      if (log) {
        log({ type: 'agent', content: evalResult.explanation });
        log({ type: 'agent', content: `Applying refinement ${refinementRound + 1}/${MAX_REFINEMENTS}...` });
      }

      // Execute refinement commands
      const executeFn = executeAgentCommandsRef.current;
      if (!executeFn) return;
      const results = await executeFn(evalResult.commands);
      if (log) {
        for (const r of results) {
          log({ type: 'agent-cmd', content: `> ${r.cmd}` });
          log({ type: r.success ? 'response' : 'error', content: `  ${r.message}` });
        }
      }

      // If refinement included sim_run, the agentTriggeredSimRef will be set
      // and this effect will re-trigger when simulation completes.
      // Check if sim_run was in the refinement commands
      const hadSimRun = evalResult.commands.some(c => c.trim().toLowerCase().startsWith('sim_run'));
      if (hadSimRun) {
        // The sim will run and this effect will be triggered again via pendingEvaluation
        // But we need to set the round counter — store it for the next eval
        (window as any).__archscope_refinement_round = refinementRound + 1;
      } else {
        if (log) log({ type: 'agent', content: 'Refinement applied. Run a simulation to verify.' });
      }
    };

    const round = (window as any).__archscope_refinement_round || 0;
    (window as any).__archscope_refinement_round = 0;
    runEvaluation(round);
  }, [pendingEvaluation, simulationResult, nodes, edges, agentEvaluateResults, agentLoading]);

  // Helper function to find node by label
  const findNodeByLabel = useCallback((label: string) => {
    return nodes.find((n) => n.data.label === label);
  }, [nodes]);

  // Helper function to check if edge already exists
  const edgeExists = useCallback((sourceId: string, targetId: string) => {
    return edges.some((e) => e.source === sourceId && e.target === targetId);
  }, [edges]);

  // AQL Architecture Command Handlers
  const handleAddComponent = useCallback((type: string, nodeId?: string, serviceId?: string, label?: string) => {
    // Validate component type
    const componentType = type as keyof typeof COMPONENT_LABELS;
    if (!COMPONENT_LABELS[componentType]) {
      return {
        success: false,
        message: `Invalid component type: ${type}`,
      };
    }

    if (!label) {
      label = COMPONENT_LABELS[componentType] || type;
    }

    // Validate duplicate label
    const existingNode = findNodeByLabel(label);
    if (existingNode) {
      return {
        success: false,
        message: `Component "${label}" already exists`,
      };
    }

    // Use the provided serviceId or fall back to default
    const finalServiceId = serviceId || COMPONENT_DEFAULTS[componentType];

    // Use label as the node ID
    const newNode: Node<SimulationNodeData> = {
      id: label,
      type: 'infra',
      position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
      data: {
        label: label,
        componentType: componentType,
        config: {
          serviceId: finalServiceId,
          cacheHitRate: componentType === 'cache' ? 0.8 : undefined,
          queueProcessingTimeMs: componentType === 'message_queue' ? 100 : undefined,
        },
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(() => saveToHistory(), 50);
    return {
      success: true,
      message: `Added ${componentType} as ${label} using ${finalServiceId}`,
    };
  }, [nodes.length, setNodes, saveToHistory, findNodeByLabel]);

  const handleRemoveNode = useCallback((label: string) => {
    const node = findNodeByLabel(label);
    if (!node) {
      return {
        success: false,
        message: `Component "${label}" not found`,
      };
    }
    deleteNode(node.id);
    return {
      success: true,
      message: `Removed ${label}`,
    };
  }, [deleteNode, findNodeByLabel]);

  const handleConnectNodes = useCallback((sourceLabel: string, targetLabel: string, animated?: boolean) => {
    const sourceNode = findNodeByLabel(sourceLabel);
    const targetNode = findNodeByLabel(targetLabel);

    if (!sourceNode) {
      return {
        success: false,
        message: `Component "${sourceLabel}" not found`,
      };
    }

    if (!targetNode) {
      return {
        success: false,
        message: `Component "${targetLabel}" not found`,
      };
    }

    // Check if edge already exists
    if (edgeExists(sourceNode.id, targetNode.id)) {
      return {
        success: false,
        message: `Connection already exists`,
      };
    }

    // Deterministic edge ID based on source and target
    const edgeId = `edge_${sourceNode.id}_${targetNode.id}`;
    const newEdge: Edge = {
      id: edgeId,
      source: sourceNode.id,
      target: targetNode.id,
      animated: animated || false,
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    };
    setEdges((eds) => [...eds, newEdge]);
    setTimeout(() => saveToHistory(), 50);
    return {
      success: true,
      message: `Connected ${sourceLabel} to ${targetLabel}${animated ? ' (animated)' : ''}`,
    };
  }, [setEdges, saveToHistory, findNodeByLabel, edgeExists]);

  const handleDisconnectNodes = useCallback((sourceLabel: string, targetLabel: string) => {
    const sourceNode = findNodeByLabel(sourceLabel);
    const targetNode = findNodeByLabel(targetLabel);

    if (!sourceNode) {
      return {
        success: false,
        message: `Component "${sourceLabel}" not found`,
      };
    }

    if (!targetNode) {
      return {
        success: false,
        message: `Component "${targetLabel}" not found`,
      };
    }

    // Check if edge exists
    if (!edgeExists(sourceNode.id, targetNode.id)) {
      return {
        success: false,
        message: `Connection does not exist`,
      };
    }

    setEdges((eds) => eds.filter((e) => !(e.source === sourceNode.id && e.target === targetNode.id)));
    setTimeout(() => saveToHistory(), 50);
    return {
      success: true,
      message: `Disconnected ${sourceLabel} from ${targetLabel}`,
    };
  }, [setEdges, saveToHistory, findNodeByLabel, edgeExists]);

  const handleRenameNode = useCallback((oldLabel: string, newLabel: string) => {
    const node = findNodeByLabel(oldLabel);
    if (!node) {
      return {
        success: false,
        message: `Component "${oldLabel}" not found`,
      };
    }

    // Validate duplicate label
    const existingNode = findNodeByLabel(newLabel);
    if (existingNode) {
      return {
        success: false,
        message: `Component "${newLabel}" already exists`,
      };
    }

    // Update the node ID to match the new label and update the label in data
    setNodes((nds) => nds.map((n) => {
      if (n.id === node.id) {
        return { ...n, id: newLabel, data: { ...n.data, label: newLabel } };
      }
      return n;
    }));
    // Update edges to use the new ID with deterministic edge IDs
    setEdges((eds) => eds.map((e) => {
      if (e.source === node.id) {
        return { ...e, source: newLabel, id: `edge_${newLabel}_${e.target}` };
      }
      if (e.target === node.id) {
        return { ...e, target: newLabel, id: `edge_${e.source}_${newLabel}` };
      }
      return e;
    }));
    setTimeout(() => saveToHistory(), 50);
    return {
      success: true,
      message: `Renamed ${oldLabel} to ${newLabel}`,
    };
  }, [findNodeByLabel, setNodes, setEdges, saveToHistory]);

  const handleShowNodes = useCallback(() => {
    return nodes.map((n) => ({
      label: n.data.label,
      type: n.data.componentType,
    }));
  }, [nodes]);

  const handleShowConnections = useCallback(() => {
    return edges.map((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      const targetNode = nodes.find((n) => n.id === e.target);
      return {
        source: sourceNode?.data.label || e.source,
        target: targetNode?.data.label || e.target,
        animated: e.animated || false,
      };
    });
  }, [edges, nodes]);

  // AQL Configuration Command Handlers
  const handleSetConfig = useCallback(async (command: string) => {
    const parsed = parseAQLCommand(command);
    if (parsed.type === 'unknown') {
      return {
        success: false,
        message: parsed.error || 'Invalid command',
      };
    }

    return executeConfigCommand(parsed, nodes, edges, updateNode);
  }, [nodes, edges, updateNode]);

  const handleMultiConfig = useCallback(async (command: string) => {
    const parsed = parseAQLCommand(command);
    if (parsed.type === 'unknown') {
      return {
        success: false,
        message: parsed.error || 'Invalid command',
      };
    }

    return executeConfigCommand(parsed, nodes, edges, updateNode);
  }, [nodes, edges, updateNode]);

  const handleResetConfig = useCallback(async (command: string) => {
    const parsed = parseAQLCommand(command);
    if (parsed.type === 'unknown') {
      return {
        success: false,
        message: parsed.error || 'Invalid command',
      };
    }

    return executeConfigCommand(parsed, nodes, edges, updateNode);
  }, [nodes, edges, updateNode]);

  // Agent batch command executor — processes all commands with fresh state
  const handleExecuteAgentCommands = useCallback(async (commands: string[]): Promise<{ cmd: string; success: boolean; message: string }[]> => {
    const results: { cmd: string; success: boolean; message: string }[] = [];

    // We need to track nodes/edges locally during the batch since React state is async
    let localNodes: Node<SimulationNodeData>[] = [...nodes];
    let localEdges: Edge[] = [...edges];

    for (const cmd of commands) {
      const parts = cmd.trim().split(/\s+/);
      const keyword = parts[0].toLowerCase();

      if (keyword === 'add') {
        const componentType = parts[1] as keyof typeof COMPONENT_LABELS;
        const asIndex = parts.findIndex(p => p.toLowerCase() === 'as');
        const label = asIndex !== -1 ? parts[asIndex + 1] : undefined;
        const usingIndex = parts.findIndex(p => p.toLowerCase() === 'using');
        const serviceId = usingIndex !== -1 ? parts[usingIndex + 1] : undefined;

        if (!componentType || !label || !COMPONENT_LABELS[componentType]) {
          results.push({ cmd, success: false, message: `Invalid add command: ${cmd}` });
          continue;
        }
        if (localNodes.some(n => n.data.label === label)) {
          results.push({ cmd, success: false, message: `Component "${label}" already exists` });
          continue;
        }
        const finalServiceId = serviceId || COMPONENT_DEFAULTS[componentType];
        const newNode: Node<SimulationNodeData> = {
          id: label,
          type: 'infra',
          position: { x: 250 + Math.random() * 200, y: 100 + localNodes.length * 120 },
          data: {
            label,
            componentType,
            config: {
              serviceId: finalServiceId,
              cacheHitRate: componentType === 'cache' ? 0.8 : undefined,
              queueProcessingTimeMs: componentType === 'message_queue' ? 100 : undefined,
            },
          },
        };
        localNodes = [...localNodes, newNode];
        results.push({ cmd, success: true, message: `Added ${componentType} as ${label} using ${finalServiceId}` });

      } else if (keyword === 'connect') {
        const source = parts[1];
        const toIdx = parts.findIndex(p => p.toLowerCase() === 'to');
        const target = toIdx !== -1 ? parts[toIdx + 1] : undefined;
        const animated = parts.some(p => p.toLowerCase() === 'animated');

        if (!source || !target) {
          results.push({ cmd, success: false, message: `Invalid connect command: ${cmd}` });
          continue;
        }
        const sourceNode = localNodes.find(n => n.data.label === source);
        const targetNode = localNodes.find(n => n.data.label === target);
        if (!sourceNode) { results.push({ cmd, success: false, message: `Component "${source}" not found` }); continue; }
        if (!targetNode) { results.push({ cmd, success: false, message: `Component "${target}" not found` }); continue; }
        if (localEdges.some(e => e.source === sourceNode.id && e.target === targetNode.id)) {
          results.push({ cmd, success: false, message: `Connection already exists` }); continue;
        }
        const newEdge: Edge = {
          id: `edge_${sourceNode.id}_${targetNode.id}`,
          source: sourceNode.id,
          target: targetNode.id,
          animated: animated || false,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        };
        localEdges = [...localEdges, newEdge];
        results.push({ cmd, success: true, message: `Connected ${source} to ${target}${animated ? ' (animated)' : ''}` });

      } else if (keyword === 'disconnect') {
        const source = parts[1];
        const fromIdx = parts.findIndex(p => p.toLowerCase() === 'from');
        const target = fromIdx !== -1 ? parts[fromIdx + 1] : undefined;
        if (!source || !target) { results.push({ cmd, success: false, message: `Invalid disconnect command: ${cmd}` }); continue; }
        const sourceNode = localNodes.find(n => n.data.label === source);
        const targetNode = localNodes.find(n => n.data.label === target);
        if (!sourceNode) { results.push({ cmd, success: false, message: `Component "${source}" not found` }); continue; }
        if (!targetNode) { results.push({ cmd, success: false, message: `Component "${target}" not found` }); continue; }
        localEdges = localEdges.filter(e => !(e.source === sourceNode.id && e.target === targetNode.id));
        results.push({ cmd, success: true, message: `Disconnected ${source} from ${target}` });

      } else if (keyword === 'remove') {
        const label = parts[1];
        const node = localNodes.find(n => n.data.label === label);
        if (!node) { results.push({ cmd, success: false, message: `Component "${label}" not found` }); continue; }
        localNodes = localNodes.filter(n => n.id !== node.id);
        localEdges = localEdges.filter(e => e.source !== node.id && e.target !== node.id);
        results.push({ cmd, success: true, message: `Removed ${label}` });

      } else if (keyword === 'rename') {
        const oldName = parts[1];
        const toIdx = parts.findIndex(p => p.toLowerCase() === 'to');
        const newName = toIdx !== -1 ? parts[toIdx + 1] : undefined;
        if (!oldName || !newName) { results.push({ cmd, success: false, message: `Invalid rename command: ${cmd}` }); continue; }
        const node = localNodes.find(n => n.data.label === oldName);
        if (!node) { results.push({ cmd, success: false, message: `Component "${oldName}" not found` }); continue; }
        localNodes = localNodes.map(n => n.id === node.id ? { ...n, id: newName, data: { ...n.data, label: newName } } : n);
        localEdges = localEdges.map(e => {
          let updated = e;
          if (e.source === node.id) updated = { ...updated, source: newName, id: `edge_${newName}_${e.target}` };
          if (e.target === node.id) updated = { ...updated, target: newName, id: `edge_${e.source}_${newName}` };
          return updated;
        });
        results.push({ cmd, success: true, message: `Renamed ${oldName} to ${newName}` });

      } else if (keyword === 'set' || keyword === 'config' || (keyword === 'reset' && parts[1]?.toLowerCase() === 'config')) {
        // Config commands operate on localNodes
        const parsed = parseAQLCommand(cmd);
        if (parsed.type === 'unknown') {
          results.push({ cmd, success: false, message: parsed.error || 'Invalid command' });
          continue;
        }
        const localUpdateNode = (nodeId: string, data: Partial<SimulationNodeData>) => {
          localNodes = localNodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n);
        };
        const result = await executeConfigCommand(parsed, localNodes as Node<SimulationNodeData>[], localEdges, localUpdateNode);
        results.push({ cmd, success: result.success, message: result.message });

      } else {
        // Simulation / preset / other commands — delegate to existing handler
        // Flush local state to React BEFORE simulation commands so sim reads current architecture
        if (keyword === 'sim_run' || keyword === 'sim_config' || keyword === 'sim_set' || keyword === 'sim_reset') {
          setNodes(localNodes as Node<SimulationNodeData>[]);
          setEdges(localEdges);
          // Give React a tick to commit the state
          await new Promise(r => setTimeout(r, 100));
        }

        // Mark that this simulation was triggered by the agent for auto-evaluation
        if (keyword === 'sim_run') {
          agentTriggeredSimRef.current = true;
        }

        const parsed = parseAQLCommand(cmd);
        if (parsed.type === 'unknown') {
          results.push({ cmd, success: false, message: parsed.error || `Unknown command: ${cmd}` });
          continue;
        }
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') || undefined : undefined;
        const updateUIParams = (partialParams: Partial<SimulationParams>) => {
          setSimulationParams(prev => ({ ...prev, ...partialParams }));
        };
        const localUpdateNode = (nodeId: string, data: Partial<SimulationNodeData>) => {
          localNodes = localNodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n);
        };
        const result = await executeConfigCommand(
          parsed, localNodes as Node<SimulationNodeData>[], localEdges, localUpdateNode,
          setNodes, setEdges, setSimulationParams, simulationParams,
          updateUIParams, handleRunSimulation, stopSimulation, handleReset,
          undefined, undefined, token, setCurrentDesignName
        );
        results.push({ cmd, success: result.success, message: result.message });
      }
    }

    // Apply the final state in one batch
    setNodes(localNodes as Node<SimulationNodeData>[]);
    setEdges(localEdges);
    setTimeout(() => saveToHistory(), 50);

    return results;
  }, [nodes, edges, setNodes, setEdges, saveToHistory, updateNode, setSimulationParams, simulationParams, handleRunSimulation, stopSimulation, handleReset, setCurrentDesignName]);

  // Keep ref in sync for evaluate effect
  executeAgentCommandsRef.current = handleExecuteAgentCommands;

  // General AQL Command Handler (for simulation commands and others)
  const handleAQLCommand = useCallback(async (command: string) => {
    const parsed = parseAQLCommand(command);
    if (parsed.type === 'unknown') {
      return {
        success: false,
        message: parsed.error || 'Invalid command',
      };
    }

    // Viewport commands — handled here using the ReactFlow instance
    if (parsed.type === 'zoom_in') {
        .current?.zoomIn();
      return { success: true, message: 'Zoomed in' };
    }
    if (parsed.type === 'zoom_out') {
      reactFlowRef.current?.zoomOut();
      return { success: true, message: 'Zoomed out' };
    }
    if (parsed.type === 'fit_view') {
      reactFlowRef.current?.fitView({ padding: 0.2 });
      return { success: true, message: 'Fit view' };
    }

    // Get token from localStorage
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || undefined : undefined;

    // Create a wrapper function that handles partial updates
    const updateUIParams = (partialParams: Partial<SimulationParams>) => {
      setSimulationParams(prev => ({ ...prev, ...partialParams }));
    };

    // Create simulation completion callback
    const handleSimulationComplete = (results: any) => {
      // This will be called when simulation completes
      console.log('Simulation completion callback received in simulator:', results);
    };

    return executeConfigCommand(
      parsed,
      nodes,
      edges,
      updateNode,
      setNodes,
      setEdges,
      setSimulationParams,
      simulationParams,
      updateUIParams,
      handleRunSimulation,
      stopSimulation,
      handleReset,
      handleSimulationComplete,
      undefined,
      token,
      setCurrentDesignName
    );
  }, [nodes, edges, updateNode, setNodes, setEdges, setSimulationParams, simulationParams, handleRunSimulation, stopSimulation, handleReset, setCurrentDesignName, reactFlowRef]);

  // Custom Hooks - Selection & Events
  const selection = useSelection(nodes, reactFlowRef);
  const { isSelecting, selectionBox, handleSelectionStart, handleSelectionMove, handleSelectionEnd } = selection;

  const nodeEvents = useNodeEvents({
    selectedNodes,
    setSelectedNode,
    setSelectedNodes,
    setSelectedEdge,
    setRightTab,
    addComponent,
    reactFlowRef,
    setEdges,
    saveToHistory,
  });
  const { onNodeClick, onPaneClick, onEdgeClick, onConnect, onDragOver, onDrop } = nodeEvents;

  // Custom Hooks - Keyboard Shortcuts
  useKeyboardShortcuts({
    selectedNodes,
    selectedNode,
    selectedEdge,
    nodes,
    setNodes,
    setEdges,
    saveToHistory,
    undo,
    redo,
    copy,
    paste,
    setSelectedNode,
    setSelectedNodes,
    setSelectedEdge,
  });

  // Memoized Values
  const selectedNodeForPanel = useMemo(() => {
    if (!selectedNode) return null;
    return nodes.find((n) => n.id === selectedNode.id) || null;
  }, [selectedNode, nodes]);

  const memoizedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isMultiSelected: selectedNodes.includes(n.id),
        },
        className: [
          n.id === selectedNode?.id ? 'selected-node' : '',
          selectedNodes.includes(n.id) ? 'multi-selected-node' : '',
        ]
          .filter(Boolean)
          .join(' '),
        selected: selectedNodes.includes(n.id) || n.id === selectedNode?.id,
      })),
    [nodes, selectedNodes, selectedNode]
  );

  const memoizedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: edge.id === selectedEdge?.id,
        style: {
          stroke: '#94a3b8',
          strokeWidth: edge.id === selectedEdge?.id ? 3 : 2,
        },
      })),
    [edges, selectedEdge]
  );

  // Custom Hooks - Resizable Panels
  const leftPanel = useResizable(256, 180, 480, false);
  const rightPanel = useResizable(288, 220, 560, true);
  const terminalPanel = useResizable(288, 200, 600, true, 'vertical');

  // Event Handlers
  const loadPreset = useCallback(
    (presetId: string | null) => {
      if (!presetId) return;
      const preset = PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      setCurrentDesignName(preset.name);

      saveToHistory();

      simulatorState.setNodes(preset.nodes as Node<SimulationNodeData>[]);
      simulatorState.setEdges(
        preset.edges.map((e: Edge) => ({
          ...e,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        }))
      );
      setSimulationParams(preset.simulationParams);
      setSimulationResult(null);
      setSelectedNode(null);
      setSelectedNodes([]);

      setTimeout(() => {
        saveToHistory();
      }, 100);

      setTimeout(() => {
        reactFlowRef.current?.fitView({ padding: 0.2 });
      }, 100);
    },
    [simulatorState, saveToHistory, setSimulationParams, setSimulationResult, setSelectedNode, setSelectedNodes, reactFlowRef]
  );

  const handleResetCanvas = useCallback(() => {
    const confirmReset = confirm('Clear entire canvas?');

    if (!confirmReset) return;

    setNodes([]);
    setEdges([]);

    // Clear both UI label and loaded design context
    setCurrentDesignName(null);
    clearCurrentDesign();
  }, [setNodes, setEdges]);

  // Render
  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      <SimulatorHeader
        selectedNodesCount={selectedNodes.length}
        loadPreset={loadPreset}
        handleLoadDesigns={(design) => {
          loadDesign(design, setNodes, setEdges);
          setCurrentDesignName(design.name);
        }}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Simulation Controls */}
        <div className="border-r bg-white flex flex-col shrink-0" style={{ width: leftPanel.size }}>
          <div className="flex flex-col h-full">

            {/* TOP BAR */}
            <SimulationTopBar
              onRun={handleRunSimulation}
              onStop={stopSimulation}
              onReset={handleReset}
              isRunning={isRunning}
            />

            {/* CONTENT (with padding + scroll) */}
            <div className="p-3 overflow-y-auto flex-1">
              <SimulationControls
                params={simulationParams}
                onParamsChange={setSimulationParams}
                onRun={handleRunSimulation}
                onStop={stopSimulation}
                onReset={handleReset}
                isRunning={isRunning}
                hasResults={!!simulationResult}
                simProgress={simProgress}
                selectedDesignName={currentDesignName}
              />
            </div>
          </div>
        </div>

        {/* Left Resize Handle */}
        <div
          onMouseDown={leftPanel.onMouseDown}
          className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors relative z-10 group"
          style={{ touchAction: 'none' }}
        >
          <div className="absolute inset-y-0 -left-2 -right-2" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-3 bg-white rounded-full" />
            <div className="w-0.5 h-3 bg-white rounded-full" />
          </div>
        </div>

        {/* CENTER AREA */}
        <div className="flex-1 flex flex-col">

          {/* TOP BAR */}
          <CanvasTopBar
            loadPreset={loadPreset}
            onSave={() => setIsSaveModalOpen(true)}
            onReset={handleResetCanvas}
            selectedDesignName={currentDesignName}
            onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
            isTerminalOpen={isTerminalOpen}
          />

          {/* CANVAS */}
          <DiagramCanvas
            nodes={memoizedNodes}
            edges={memoizedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            reactFlowRef={reactFlowRef}
            handleSelectionStart={handleSelectionStart}
            handleSelectionMove={handleSelectionMove}
            handleSelectionEnd={handleSelectionEnd}
            setSelectedNodes={setSelectedNodes}
            isSelecting={isSelecting}
            selectionBox={selectionBox}
            isMinimapCollapsed={isMinimapCollapsed}
            setIsMinimapCollapsed={setIsMinimapCollapsed}
          />
          
          {/* TERMINAL PANEL */}
          {isTerminalOpen && (
            <>
              {/* Terminal Resize Handle */}
              <div
                onMouseDown={terminalPanel.onMouseDown}
                className="h-1.5 shrink-0 cursor-row-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors relative z-10 group"
                style={{ touchAction: 'none' }}
              >
                <div className="absolute inset-x-0 -top-2 -bottom-2" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-row gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="h-0.5 w-3 bg-white rounded-full" />
                  <div className="h-0.5 w-3 bg-white rounded-full" />
                </div>
              </div>
              <TerminalPanel
                onClose={() => setIsTerminalOpen(false)}
                onAddComponent={handleAddComponent}
                onRemoveNode={handleRemoveNode}
                onConnectNodes={handleConnectNodes}
                onDisconnectNodes={handleDisconnectNodes}
                onRenameNode={handleRenameNode}
                onShowNodes={handleShowNodes}
                onShowConnections={handleShowConnections}
                onSetConfig={handleSetConfig}
                onMultiConfig={handleMultiConfig}
                onResetConfig={handleResetConfig}
                onAQLCommand={handleAQLCommand}
                onAgentMessage={(msg) => agentSendMessage(msg, nodes, edges)}
                onExecuteAgentCommands={handleExecuteAgentCommands}
                agentLoading={agentLoading}
                agentError={agentError}
                onResetAgentSession={agentResetSession}
                onRegisterLogger={(logger) => { terminalLogRef.current = logger; }}
                height={terminalPanel.size}
              />
            </>
          )}
        </div>

        {/* Right Resize Handle */}
        <div
          onMouseDown={rightPanel.onMouseDown}
          className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors relative z-10 group"
          style={{ touchAction: 'none' }}
        >
          <div className="absolute inset-y-0 -left-2 -right-2" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-3 bg-white rounded-full" />
            <div className="w-0.5 h-3 bg-white rounded-full" />
          </div>
        </div>

        <RightSidebar
          rightTab={rightTab}
          setRightTab={setRightTab}
          rightPanelSize={rightPanel.size}
          addComponent={addComponent}
          selectedNodeForPanel={selectedNodeForPanel}
          updateNode={updateNode}
          deleteNode={deleteNode}
          simulationResult={simulationResult}
          liveTimeSeries={liveTimeSeries}
          isRunning={isRunning}
          handleFastForward={handleFastForward}
        />
      </div>
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onUpdate={saveDesign}
        onSaveAsNew={() => {
          clearCurrentDesign();
          saveDesign();
        }}
        hasExisting={!!currentDesignId}
      />
    </div>
  );
}
