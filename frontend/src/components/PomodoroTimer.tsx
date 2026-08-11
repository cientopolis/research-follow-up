import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from '../firebase';

export interface PomodoroTimerNode {
  uri: string;
  label: string;
}

export interface PomodoroTask {
  uri: string;
  title: string;
  description: string;
  status: 'pending' | 'completed';
  involvedNodes: string[]; // List of URIs
}

interface PomodoroTimerProps {
  onClose?: () => void;
  showCloseButton?: boolean;
  nodes?: PomodoroTimerNode[];
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({
  onClose,
  showCloseButton = true,
  nodes = [],
}) => {
  const fetchWithAuth = useCallback(async (url: RequestInfo | URL, options: RequestInit = {}) => {
    const token = await auth.currentUser?.getIdToken();
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    } as Record<string, string>;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, {
      ...options,
      headers,
    });
  }, []);

  const [pomodoroMode, setPomodoroMode] = useState<'work' | 'shortBreak' | 'longBreak'>('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [customWorkTime, setCustomWorkTime] = useState(25);
  const [customBreakTime, setCustomBreakTime] = useState(5);
  const [completedCycles, setCompletedCycles] = useState(0);

  // UX Options
  const [selectedSound, setSelectedSound] = useState<'chime' | 'bell' | 'digital'>('chime');
  const [selectedTickSound, setSelectedTickSound] = useState<'classic' | 'wood' | 'noise'>('classic');
  const [soundVolume, setSoundVolume] = useState(0.8);
  const [autoStartBreak, setAutoStartBreak] = useState(true);
  const [autoStartWork, setAutoStartWork] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [enableTickTock, setEnableTickTock] = useState(true);

  // Tasks-related States
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [selectedTaskUri, setSelectedTaskUri] = useState<string | null>(null);
  const [currentPomodoroStart, setCurrentPomodoroStart] = useState<string | null>(null);
  const [taskWarning, setTaskWarning] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskNodes, setNewTaskNodes] = useState<string[]>([]);
  const [syncedNodes, setSyncedNodes] = useState<PomodoroTimerNode[]>(nodes);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');

  // Manage currentPomodoroStart timestamp
  useEffect(() => {
    if (timerRunning && pomodoroMode === 'work') {
      if (!currentPomodoroStart) {
        setCurrentPomodoroStart(new Date().toISOString());
      }
    } else if (!timerRunning && timeLeft === (pomodoroMode === 'work' ? customWorkTime * 60 : customBreakTime * 60)) {
      setCurrentPomodoroStart(null);
    }
  }, [timerRunning, pomodoroMode, timeLeft]);

  // Sync syncedNodes when props change
  useEffect(() => {
    if (nodes && nodes.length > 0) {
      setSyncedNodes(nodes);
    }
  }, [nodes]);

  // Collapsible sections state
  const [showConfig, setShowConfig] = useState(false);
  const [showUXOptions, setShowUXOptions] = useState(false);

  // Persistent Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Synchronization with BroadcastChannel
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isIncomingUpdate = useRef(false);

  const isStandalone = new URLSearchParams(window.location.search).get('view') === 'pomodoro';

  useEffect(() => {
    if (isStandalone) {
      localStorage.setItem('pomodoro_standalone_open', 'true');
      return () => {
        localStorage.setItem('pomodoro_standalone_open', 'false');
      };
    }
  }, [isStandalone]);

  const shouldPlayAudio = () => {
    if (isStandalone) {
      return true;
    }
    return localStorage.getItem('pomodoro_standalone_open') !== 'true';
  };

  const stateRef = useRef({
    timeLeft,
    timerRunning,
    pomodoroMode,
    customWorkTime,
    customBreakTime,
    completedCycles,
    soundVolume,
    selectedSound,
    selectedTickSound,
    enableTickTock,
    autoStartBreak,
    autoStartWork,
    notificationsEnabled,
    tasks,
    selectedTaskUri,
    syncedNodes,
    currentPomodoroStart,
  });

  // Keep stateRef up to date on every render
  useEffect(() => {
    stateRef.current = {
      timeLeft,
      timerRunning,
      pomodoroMode,
      customWorkTime,
      customBreakTime,
      completedCycles,
      soundVolume,
      selectedSound,
      selectedTickSound,
      enableTickTock,
      autoStartBreak,
      autoStartWork,
      notificationsEnabled,
      tasks,
      selectedTaskUri,
      syncedNodes,
      currentPomodoroStart,
    };
  }, [
    timeLeft,
    timerRunning,
    pomodoroMode,
    customWorkTime,
    customBreakTime,
    completedCycles,
    soundVolume,
    selectedSound,
    selectedTickSound,
    enableTickTock,
    autoStartBreak,
    autoStartWork,
    notificationsEnabled,
    tasks,
    selectedTaskUri,
    syncedNodes,
    currentPomodoroStart,
  ]);

  // Listen to incoming sync events
  useEffect(() => {
    const channel = new BroadcastChannel('pomodoro_sync');
    channelRef.current = channel;

    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;
      if (type === 'SYNC_STATE') {
        isIncomingUpdate.current = true;
        
        setTimeLeft(payload.timeLeft);
        setTimerRunning(payload.timerRunning);
        setPomodoroMode(payload.pomodoroMode);
        setCustomWorkTime(payload.customWorkTime);
        setCustomBreakTime(payload.customBreakTime);
        setCompletedCycles(payload.completedCycles);
        setSoundVolume(payload.soundVolume);
        setSelectedSound(payload.selectedSound);
        setSelectedTickSound(payload.selectedTickSound);
        setEnableTickTock(payload.enableTickTock);
        setAutoStartBreak(payload.autoStartBreak);
        setAutoStartWork(payload.autoStartWork);
        setNotificationsEnabled(payload.notificationsEnabled);
        setTasks(payload.tasks || []);
        setSelectedTaskUri(payload.selectedTaskUri);
        setSyncedNodes(payload.syncedNodes || []);
        setCurrentPomodoroStart(payload.currentPomodoroStart);
        
        setTimeout(() => {
          isIncomingUpdate.current = false;
        }, 100);
      } else if (type === 'REQUEST_SYNC') {
        channel.postMessage({
          type: 'SYNC_STATE',
          payload: stateRef.current
        });
      }
    };

    channel.addEventListener('message', handleMessage);
    
    // Request sync from existing instances on mount
    channel.postMessage({ type: 'REQUEST_SYNC' });

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // Broadcast state updates to other instances
  useEffect(() => {
    if (isIncomingUpdate.current) {
      return;
    }
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'SYNC_STATE',
        payload: {
          timeLeft,
          timerRunning,
          pomodoroMode,
          customWorkTime,
          customBreakTime,
          completedCycles,
          soundVolume,
          selectedSound,
          selectedTickSound,
          enableTickTock,
          autoStartBreak,
          autoStartWork,
          notificationsEnabled,
          tasks,
          selectedTaskUri,
          syncedNodes,
          currentPomodoroStart,
        }
      });
    }
  }, [
    timeLeft,
    timerRunning,
    pomodoroMode,
    customWorkTime,
    customBreakTime,
    completedCycles,
    soundVolume,
    selectedSound,
    selectedTickSound,
    enableTickTock,
    autoStartBreak,
    autoStartWork,
    notificationsEnabled,
    tasks,
    selectedTaskUri,
    syncedNodes,
    currentPomodoroStart,
  ]);

  // Fetch tasks from GraphDB
  const fetchTasks = async () => {
    if (!auth.currentUser) return;
    const userUri = `http://cientopolis.org/rfu/user/${auth.currentUser.uid}`;
    setIsLoadingTasks(true);
    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX tmo: <http://www.semanticdesktop.org/ontologies/2008/05/20/tmo#>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      SELECT ?task ?title ?description ?status ?involvedNode ?pomodoro ?pStart ?pEnd WHERE {
        ?task rdf:type tmo:Task .
        ?task rfu:createdBy <${userUri}> .
        OPTIONAL { ?task dcterms:title ?title }
        OPTIONAL { ?task dcterms:description ?description }
        OPTIONAL { ?task rfu:taskStatus ?status }
        OPTIONAL { ?task rfu:involvesNode ?involvedNode }
        OPTIONAL { 
          ?task rfu:hasPomodoro ?pomodoro .
          ?pomodoro rfu:startTime ?pStart .
          ?pomodoro rfu:endTime ?pEnd .
        }
      }
    `;
    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.results && data.results.bindings) {
        const taskMap: { [uri: string]: PomodoroTask } = {};
        data.results.bindings.forEach((b: any) => {
          const uri = b.task.value;
          const title = b.title ? b.title.value : '';
          const description = b.description ? b.description.value : '';
          const status = b.status ? b.status.value as 'pending' | 'completed' : 'pending';
          const node = b.involvedNode ? b.involvedNode.value : null;
          const pUri = b.pomodoro ? b.pomodoro.value : null;
          const pStart = b.pStart ? b.pStart.value : '';
          const pEnd = b.pEnd ? b.pEnd.value : '';

          if (!taskMap[uri]) {
            taskMap[uri] = {
              uri,
              title,
              description,
              status,
              involvedNodes: [],
              pomodoros: []
            };
          }
          if (node && !taskMap[uri].involvedNodes.includes(node)) {
            taskMap[uri].involvedNodes.push(node);
          }
          if (pUri) {
            const pStartMs = new Date(pStart).getTime();
            // Evitar duplicados temporales en la vista (pomodoros a menos de 60 segundos de diferencia)
            const isDuplicate = taskMap[uri].pomodoros.some(p => {
              const existingStartMs = new Date(p.startTime).getTime();
              return Math.abs(existingStartMs - pStartMs) < 60000;
            });

            if (!isDuplicate && !taskMap[uri].pomodoros.some(p => p.uri === pUri)) {
              taskMap[uri].pomodoros.push({
                uri: pUri,
                startTime: pStart,
                endTime: pEnd
              });
            }
          }
        });
        const taskList = Object.values(taskMap);
        setTasks(taskList);
      }
    } catch (e) {
      console.error("Error al buscar tareas en GraphDB", e);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const createTaskInGraphDB = async (title: string, description: string, nodeUris: string[]) => {
    if (!auth.currentUser) return;
    const userUri = `http://cientopolis.org/rfu/user/${auth.currentUser.uid}`;
    const taskId = Date.now();
    const taskUri = `http://cientopolis.org/rfu/task/${taskId}`;
    
    // Build SPARQL insert query triples for involved nodes
    let nodesTriples = '';
    nodeUris.forEach((uri) => {
      nodesTriples += `    rfu:involvesNode <${uri}> ;\n`;
    });

    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX tmo: <http://www.semanticdesktop.org/ontologies/2008/05/20/tmo#>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT DATA {
        <${taskUri}> rdf:type tmo:Task ;
          dcterms:title "${title.replace(/"/g, '\\"')}" ;
          dcterms:description "${description.replace(/"/g, '\\"')}" ;
          rfu:taskStatus "pending" ;
          rfu:createdBy <${userUri}> ;
      ${nodesTriples}    rdf:type tmo:Task .
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.success) {
        const newTask: PomodoroTask = {
          uri: taskUri,
          title,
          description,
          status: 'pending',
          involvedNodes: nodeUris,
          pomodoros: []
        };
        setTasks((prev) => [...prev, newTask]);
        setSelectedTaskUri(taskUri);
        // Clear creation form
        setIsCreatingTask(false);
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewTaskNodes([]);
      }
    } catch (e) {
      console.error("Error al guardar tarea en GraphDB", e);
    }
  };

  const completeTaskInGraphDB = async (taskUri: string) => {
    const query = `
      PREFIX rfu: <http://cientopolis.org/rfu/>

      DELETE {
        <${taskUri}> rfu:taskStatus ?status .
      }
      INSERT {
        <${taskUri}> rfu:taskStatus "completed" .
      }
      WHERE {
        <${taskUri}> rfu:taskStatus ?status .
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.success) {
        setTasks((prev) =>
          prev.map((t) => (t.uri === taskUri ? { ...t, status: 'completed' } : t))
        );
        if (selectedTaskUri === taskUri) {
          setSelectedTaskUri(null);
        }
      }
    } catch (e) {
      console.error("Error al completar tarea en GraphDB", e);
    }
  };

  const registerPomodoroInGraphDB = async (taskUri: string, startIso: string, endIso: string) => {
    // Lock de 10 segundos en localStorage para evitar inserciones duplicadas entre ventanas concurrentes
    const lockKey = `pomodoro_lock_${taskUri}_${Math.floor(Date.now() / 10000)}`;
    if (localStorage.getItem(lockKey)) {
      console.warn("Inserción de Pomodoro bloqueada: ya registrada por otra pestaña/ventana.");
      return;
    }
    localStorage.setItem(lockKey, 'locked');

    const pomodoroId = Date.now();
    const pomodoroUri = `http://cientopolis.org/rfu/pomodoro/${pomodoroId}`;

    const query = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rfu: <http://cientopolis.org/rfu/>

      INSERT {
        <${pomodoroUri}> rdf:type rfu:PomodoroSession ;
          rfu:startTime "${startIso}"^^xsd:dateTime ;
          rfu:endTime "${endIso}"^^xsd:dateTime .

        <${taskUri}> rfu:hasPomodoro <${pomodoroUri}> .
      }
      WHERE {
        FILTER NOT EXISTS {
          <${taskUri}> rfu:hasPomodoro ?existingPomodoro .
          ?existingPomodoro rfu:startTime "${startIso}"^^xsd:dateTime ;
                            rfu:endTime "${endIso}"^^xsd:dateTime .
        }
      }
    `;

    try {
      const response = await fetchWithAuth('/api/sparql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.success) {
        fetchTasks();
      }
    } catch (e) {
      console.error("Error al registrar Pomodoro en GraphDB", e);
    }
  };

  // Fetch tasks on mount
  useEffect(() => {
    fetchTasks();
  }, []);

  const initAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      
      // Safari requires a quick sound to unlock web audio in the same user gesture callback
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      gain.gain.setValueAtTime(0.00001, audioCtxRef.current.currentTime);
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start(0);
      osc.stop(0.01);
    } catch (e) {
      console.error("Audio Context initialization failed", e);
    }
  };

  const playTickTock = (isEven: boolean) => {
    if (!shouldPlayAudio()) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended') {
      return;
    }
    try {
      const audioCtx = audioCtxRef.current;
      const now = audioCtx.currentTime + 0.02; // 20ms buffer for Safari scheduler
      const gain = audioCtx.createGain();
      gain.connect(audioCtx.destination);

      if (selectedTickSound === 'classic') {
        const osc = audioCtx.createOscillator();
        osc.connect(gain);
        osc.type = 'sine';
        
        // Safari fixes: assign direct values and schedule with offset
        osc.frequency.value = isEven ? 1600 : 1200;
        osc.frequency.setValueAtTime(isEven ? 1600 : 1200, now);
        
        const tickVolume = 0.08 * soundVolume;
        gain.gain.value = tickVolume;
        gain.gain.setValueAtTime(tickVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (selectedTickSound === 'wood') {
        const osc = audioCtx.createOscillator();
        osc.connect(gain);
        osc.type = 'triangle';
        
        osc.frequency.value = isEven ? 800 : 600;
        osc.frequency.setValueAtTime(isEven ? 800 : 600, now);
        
        const tickVolume = 0.15 * soundVolume;
        gain.gain.value = tickVolume;
        gain.gain.setValueAtTime(tickVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
        
        osc.start(now);
        osc.stop(now + 0.02);
      } else if (selectedTickSound === 'noise') {
        const bufferSize = audioCtx.sampleRate * 0.02;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        
        filter.frequency.value = isEven ? 3500 : 2500;
        filter.frequency.setValueAtTime(isEven ? 3500 : 2500, now);

        noiseNode.connect(filter);
        filter.connect(gain);

        const tickVolume = 0.12 * soundVolume;
        gain.gain.value = tickVolume;
        gain.gain.setValueAtTime(tickVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

        noiseNode.start(now);
        noiseNode.stop(now + 0.025);
      }
    } catch (e) {
      console.error("Tick-tock sound failed", e);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setNotificationsEnabled(granted);
      if (granted) {
        new Notification("Notificaciones Activas 🍅", { body: "Las alertas del Pomodoro te notificarán aquí." });
      }
    }
  };

  const sendDesktopNotification = (title: string, body: string) => {
    if (!shouldPlayAudio()) return;
    if (notificationsEnabled && 'Notification' in window) {
      new Notification(title, { body, icon: '🍅' });
    }
  };

  const playAlertSound = () => {
    if (!shouldPlayAudio()) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended') {
      return;
    }
    try {
      const audioCtx = audioCtxRef.current;
      const playTone = (freq: number, type: OscillatorType, start: number, duration: number, volStart: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = type;
        osc.frequency.value = freq;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.value = volStart * soundVolume;
        gain.gain.setValueAtTime(volStart * soundVolume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = audioCtx.currentTime + 0.05; // 50ms buffer for Safari scheduler
      if (selectedSound === 'chime') {
        playTone(880, 'sine', now, 0.5, 0.4);
        playTone(1200, 'sine', now + 0.15, 0.7, 0.4);
      } else if (selectedSound === 'bell') {
        const freqs = [440, 554, 659, 880, 1200];
        freqs.forEach((f) => playTone(f, 'triangle', now, 1.4, 0.2));
      } else if (selectedSound === 'digital') {
        playTone(2000, 'square', now, 0.12, 0.3);
        playTone(2000, 'square', now + 0.15, 0.12, 0.3);
        playTone(2000, 'square', now + 0.3, 0.12, 0.3);
      }
    } catch (e) {
      console.error("Audio Context failed", e);
    }
  };

  // Sync Timer with Page Tab Title
  useEffect(() => {
    if (timerRunning) {
      const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const seconds = (timeLeft % 60).toString().padStart(2, '0');
      const emoji = pomodoroMode === 'work' ? '🍅' : '🍃';
      document.title = `(${minutes}:${seconds}) ${emoji} Pomodoro`;
    } else {
      document.title = "Pomodoro Timer";
    }
  }, [timeLeft, timerRunning, pomodoroMode]);

  // Request notification permission on mount if available
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(t => {
          const next = t - 1;
          if (enableTickTock && next >= 0) {
            playTickTock(next % 2 === 0);
          }
          return next;
        });
      }, 1000);
    } else if (timeLeft === 0 && timerRunning) {
      setTimerRunning(false);
      playAlertSound();
      
      if (pomodoroMode === 'work') {
        // Record Pomodoro Session in GraphDB if a task is active (only from the active audio master window to avoid duplicates)
        if (selectedTaskUri && shouldPlayAudio()) {
          const startTime = currentPomodoroStart || new Date(Date.now() - customWorkTime * 60 * 1000).toISOString();
          const endTime = new Date().toISOString();
          registerPomodoroInGraphDB(selectedTaskUri, startTime, endTime);
        }

        setCompletedCycles(c => c + 1);
        sendDesktopNotification("¡Buen trabajo! 🍅", "Tiempo de tomar un descanso.");
        setPomodoroMode('shortBreak');
        setTimeLeft(customBreakTime * 60);
        setCurrentPomodoroStart(null);
        if (autoStartBreak) {
          setTimeout(() => setTimerRunning(true), 500);
        }
      } else {
        sendDesktopNotification("¡De vuelta al trabajo! 🎯", "Comienza una nueva sesión de enfoque.");
        setPomodoroMode('work');
        setTimeLeft(customWorkTime * 60);
        setCurrentPomodoroStart(null);
        if (autoStartWork) {
          setTimeout(() => setTimerRunning(true), 500);
        }
      }
    }
    return () => clearInterval(interval);
  }, [timerRunning, timeLeft, pomodoroMode, customWorkTime, customBreakTime, selectedSound, soundVolume, autoStartBreak, autoStartWork, notificationsEnabled, enableTickTock, selectedTaskUri, currentPomodoroStart]);

  const openInNewWindow = () => {
    window.open('?view=pomodoro', 'PomodoroTimerWindow', 'width=420,height=720,menubar=no,status=no,toolbar=no');
  };

  const isDev = import.meta.env.DEV;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      width: '100%', 
      height: '100%', 
      color: 'var(--text)',
      padding: isStandalone ? '20px 0 0 0' : '0',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      <div className="sidebar-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%', 
        borderBottom: '1px solid var(--border-color)', 
        paddingBottom: '12px',
        paddingLeft: isStandalone ? '24px' : '0',
        paddingRight: isStandalone ? '24px' : '0',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>🍅 Pomodoro</h2>
        {isDev && <span className="dev-tag-badge">#pomodoroHeader</span>}
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isStandalone && (
            <button className="btn btn-sm btn-secondary" title="Abrir en ventana separada" onClick={openInNewWindow}>
              ↗️ Separar
            </button>
          )}
          {showCloseButton && onClose && (
            <button className="btn btn-sm" onClick={onClose}>
              Ocultar
            </button>
          )}
        </div>
      </div>
      
      <div className="sidebar-content" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        gap: '20px', 
        padding: isStandalone ? '16px 24px' : '16px 0', 
        overflowY: 'auto', 
        flex: 1,
        width: '100%',
        boxSizing: 'border-box'
      }}>
        
        {/* Circular SVG Radial Progress Timer Display */}
        <div className={`pomodoro-display ${pomodoroMode === 'work' ? 'work-mode' : 'break-mode'}`} style={{ position: 'relative' }}>
          {isDev && <span className="dev-tag-badge" style={{ top: '-10px', right: '15px' }}>#pomodoroDisplay</span>}
          <div style={{ zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span className="pomodoro-time">
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
              {(timeLeft % 60).toString().padStart(2, '0')}
            </span>
            <span className="pomodoro-status-tag">
              {pomodoroMode === 'work' ? 'TRABAJO' : 'RECREO'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-row" style={{ gap: '12px', justifyContent: 'center', width: '100%', position: 'relative' }}>
          {isDev && <span className="dev-tag-badge" style={{ top: '-14px', right: '0px' }}>#pomodoroControls</span>}
          <button 
            className={`btn ${timerRunning ? 'btn-danger' : 'btn-primary'}`} 
            onClick={() => {
              initAudio();
              if (!timerRunning && !selectedTaskUri) {
                setTaskWarning(true);
                setTimeout(() => setTaskWarning(false), 5000);
                return;
              }
              setTimerRunning(!timerRunning);
            }}
            style={{ flex: 1 }}
          >
            {timerRunning ? 'Pausar' : 'Iniciar'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              initAudio();
              setTimerRunning(false);
              setTimeLeft(pomodoroMode === 'work' ? customWorkTime * 60 : customBreakTime * 60);
            }}
          >
            Reiniciar
          </button>
        </div>

        {taskWarning && (
          <div style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            fontSize: '0.75rem',
            textAlign: 'center',
            lineHeight: '1.4',
            boxSizing: 'border-box',
            fontWeight: 500
          }}>
            ⚠️ Debes seleccionar una tarea activa o crear una nueva para poder iniciar el temporizador.
          </div>
        )}

        {/* Presets */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
          {isDev && <span className="dev-tag-badge" style={{ top: '-14px', right: '0px' }}>#pomodoroPresets</span>}
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>PREAJUSTES</label>
          <div className="flex-row" style={{ gap: '6px' }}>
            <button className="btn btn-sm" onClick={() => {
              initAudio();
              setTimerRunning(false);
              setPomodoroMode('work');
              setTimeLeft(customWorkTime * 60);
            }} style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>Trabajo ({customWorkTime}m)</button>
            
            <button className="btn btn-sm" onClick={() => {
              initAudio();
              setTimerRunning(false);
              setPomodoroMode('shortBreak');
              setTimeLeft(customBreakTime * 60);
            }} style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>Recreo ({customBreakTime}m)</button>

            <button className="btn btn-sm" onClick={() => {
              initAudio();
              setTimerRunning(false);
              setPomodoroMode('longBreak');
              setTimeLeft(15 * 60);
            }} style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>Largo (15m)</button>
          </div>
        </div>

        {/* Current Task Section */}
        <div id="pomodoroCurrentTask" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: 'var(--bg-mantle)', boxSizing: 'border-box' }}>
          {isDev && <span className="dev-tag-badge" style={{ top: '-10px', right: '10px' }}>#pomodoroCurrentTask</span>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>EL DÍA A DÍA DEL DIRE, ORGANIZADO</label>
            {!isCreatingTask && (
              <button className="btn btn-sm btn-secondary" onClick={() => setIsCreatingTask(true)} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                + Nueva
              </button>
            )}
          </div>

          {isCreatingTask ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem' }}>Título:</span>
                <input 
                  type="text" 
                  value={newTaskTitle} 
                  onChange={(e) => setNewTaskTitle(e.target.value)} 
                  placeholder="Escritura del abstract del paper..." 
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-crust)', color: 'var(--text)', fontSize: '0.75rem', width: '100%', boxSizing: 'border-box' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem' }}>Descripción:</span>
                <textarea 
                  value={newTaskDesc} 
                  onChange={(e) => setNewTaskDesc(e.target.value)} 
                  placeholder="Incluir el alcance y conclusiones..." 
                  rows={2}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-crust)', color: 'var(--text)', fontSize: '0.75rem', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem' }}>Nodos Involucrados:</span>
                <input 
                  type="text" 
                  value={nodeSearchQuery} 
                  onChange={(e) => setNodeSearchQuery(e.target.value)} 
                  placeholder="Buscar nodo..." 
                  style={{ padding: '4px 6px', marginBottom: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-crust)', color: 'var(--text)', fontSize: '0.7rem', width: '100%', boxSizing: 'border-box' }} 
                />
                <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px', background: 'var(--bg-crust)', display: 'flex', flexDirection: 'column', gap: '6px', boxSizing: 'border-box' }}>
                  {syncedNodes && syncedNodes.filter(n => n.label.toLowerCase().includes(nodeSearchQuery.toLowerCase())).map((node) => {
                    const isChecked = newTaskNodes.includes(node.uri);
                    return (
                      <label key={node.uri} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => {
                            if (isChecked) {
                              setNewTaskNodes(newTaskNodes.filter(uri => uri !== node.uri));
                            } else {
                              setNewTaskNodes([...newTaskNodes, node.uri]);
                            }
                          }}
                          style={{ accentColor: 'var(--color-proyecto)' }}
                        />
                        <span>{node.label}</span>
                      </label>
                    );
                  })}
                  {(!syncedNodes || syncedNodes.length === 0) && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>No hay nodos en el grafo</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => {
                    setIsCreatingTask(false);
                    setNewTaskTitle('');
                    setNewTaskDesc('');
                    setNewTaskNodes([]);
                    setNodeSearchQuery('');
                  }} 
                  style={{ flex: 1, fontSize: '0.7rem' }}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-sm btn-primary" 
                  disabled={!newTaskTitle.trim() || isLoadingTasks} 
                  onClick={() => createTaskInGraphDB(newTaskTitle, newTaskDesc, newTaskNodes)} 
                  style={{ flex: 1, fontSize: '0.7rem' }}
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Task Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Seleccionar Tarea Activa:</span>
                <select 
                  value={selectedTaskUri || ''} 
                  onChange={(e) => setSelectedTaskUri(e.target.value || null)}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-crust)', color: 'var(--text)', fontSize: '0.75rem', width: '100%', boxSizing: 'border-box' }}
                >
                  <option value="">-- Ninguna --</option>
                  {tasks.filter(t => t.status === 'pending').map(task => (
                    <option key={task.uri} value={task.uri}>{task.title}</option>
                  ))}
                </select>
              </div>

              {/* Active Task Details */}
              {(() => {
                const activeTask = tasks.find(t => t.uri === selectedTaskUri);
                if (!activeTask) return null;
                return (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{activeTask.title}</div>
                    {activeTask.description && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>{activeTask.description}</div>
                    )}

                    {activeTask.pomodoros && activeTask.pomodoros.length > 0 && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🍅 Pomodoros completados:</span>
                        <strong style={{ color: 'var(--color-proyecto)' }}>{activeTask.pomodoros.length}</strong>
                      </div>
                    )}
                    
                    {activeTask.involvedNodes && activeTask.involvedNodes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>Nodos involucrados:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {activeTask.involvedNodes.map(nodeUri => {
                            const nodeObj = syncedNodes.find(n => n.uri === nodeUri);
                            return (
                              <span key={nodeUri} style={{ fontSize: '0.65rem', background: 'var(--bg-crust)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                {nodeObj ? nodeObj.label : nodeUri.split('/').pop()}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => setSelectedTaskUri(null)}
                        style={{ fontSize: '0.7rem', padding: '4px 8px', flex: 1 }}
                      >
                        Desvincular
                      </button>
                      <button 
                        className="btn btn-sm btn-primary" 
                        onClick={() => completeTaskInGraphDB(activeTask.uri)}
                        style={{ fontSize: '0.7rem', padding: '4px 8px', flex: 1 }}
                      >
                        Completar
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Stats */}
        {(() => {
          const totalCompletedTasks = tasks.filter(t => t.status === 'completed').length;
          const totalCompletedPomodoros = tasks.reduce((sum, t) => sum + (t.pomodoros ? t.pomodoros.length : 0), 0);
          return (
            <div style={{ width: '100%', background: 'var(--bg-crust)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
              {isDev && <span className="dev-tag-badge">#pomodoroStats</span>}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ESTADÍSTICAS</span>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Tareas Finalizadas:</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-proyecto)' }}>{totalCompletedTasks}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Pomodoros Totales Realizados:</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-proyecto)' }}>{totalCompletedPomodoros} 🍅</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Sesión Actual (Ciclos sin registrar):</span>
                <span style={{ fontSize: '1rem', marginTop: '2px' }}>
                  {completedCycles > 0 ? Array(completedCycles).fill('🍅').join(' ') : 'Ninguno todavía'}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Collapsible custom settings & UX at the bottom */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
            <div 
              onClick={() => setShowConfig(!showConfig)} 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '6px 0', borderBottom: '1px dashed var(--border-color)', position: 'relative' }}
            >
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', margin: 0 }}>CONFIGURACIÓN</label>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{showConfig ? '▼' : '▶'}</span>
            </div>
            {isDev && <span className="dev-tag-badge" style={{ top: '6px', right: '20px' }}>#pomodoroConfig</span>}
            
            {showConfig && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Minutos Trabajo:</span>
                  <input 
                    type="number" 
                    value={customWorkTime} 
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 25);
                      setCustomWorkTime(val);
                      if (!timerRunning && pomodoroMode === 'work') setTimeLeft(val * 60);
                    }}
                    style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-mantle)', color: 'var(--text)', fontSize: '0.75rem' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Minutos Recreo:</span>
                  <input 
                    type="number" 
                    value={customBreakTime} 
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 5);
                      setCustomBreakTime(val);
                      if (!timerRunning && pomodoroMode === 'shortBreak') setTimeLeft(val * 60);
                    }}
                    style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-mantle)', color: 'var(--text)', fontSize: '0.75rem' }}
                  />
                </div>
              </div>
            )}

            <div 
              onClick={() => setShowUXOptions(!showUXOptions)} 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '6px 0', marginTop: '4px', borderBottom: '1px dashed var(--border-color)' }}
            >
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', margin: 0 }}>UX & ALERTAS</label>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{showUXOptions ? '▼' : '▶'}</span>
            </div>
            {isDev && <span className="dev-tag-badge" style={{ top: '34px', right: '20px' }}>#pomodoroUX</span>}

            {showUXOptions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
                {/* Desktop Notifications Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Notificaciones de Escritorio:</span>
                  <button 
                    className={`btn btn-sm ${notificationsEnabled ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={requestNotificationPermission}
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                  >
                    {notificationsEnabled ? 'Habilitadas' : 'Habilitar'}
                  </button>
                </div>

                {/* Auto Start Options */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Iniciar recreo automáticamente:</span>
                  <input 
                    type="checkbox" 
                    checked={autoStartBreak} 
                    onChange={(e) => setAutoStartBreak(e.target.checked)}
                    style={{ accentColor: 'var(--color-proyecto)' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Iniciar trabajo automáticamente:</span>
                  <input 
                    type="checkbox" 
                    checked={autoStartWork} 
                    onChange={(e) => setAutoStartWork(e.target.checked)}
                    style={{ accentColor: 'var(--color-proyecto)' }}
                  />
                </div>

                {/* Tick Oock Option */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Sonido Tictac continuo:</span>
                  <input 
                    type="checkbox" 
                    checked={enableTickTock} 
                    onChange={(e) => setEnableTickTock(e.target.checked)}
                    style={{ accentColor: 'var(--color-proyecto)' }}
                  />
                </div>

                {/* Tictac Sound Selection */}
                {enableTickTock && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem' }}>Tipo de tictac:</span>
                    <select 
                      value={selectedTickSound} 
                      onChange={(e) => setSelectedTickSound(e.target.value as any)}
                      style={{ padding: '4px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-mantle)', color: 'var(--text)', fontSize: '0.75rem' }}
                    >
                      <option value="classic">Clásico</option>
                      <option value="wood">Madera</option>
                      <option value="noise">Moderno</option>
                    </select>
                  </div>
                )}

                {/* End Cycle Alert Sound Selection */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem' }}>Sonido fin de ciclo:</span>
                  <select 
                    value={selectedSound} 
                    onChange={(e) => setSelectedSound(e.target.value as any)}
                    style={{ padding: '4px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-mantle)', color: 'var(--text)', fontSize: '0.75rem' }}
                  >
                    <option value="chime">Chime</option>
                    <option value="bell">Campana</option>
                    <option value="digital">Digital</option>
                  </select>
                </div>

                {/* Volume Control */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span>Volumen:</span>
                    <span>{Math.round(soundVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={soundVolume} 
                    onChange={(e) => {
                      const vol = parseFloat(e.target.value);
                      setSoundVolume(vol);
                      initAudio();
                      try {
                        const ctx = audioCtxRef.current;
                        if (ctx && ctx.state === 'running') {
                          const osc = ctx.createOscillator();
                          const gain = ctx.createGain();
                          osc.connect(gain);
                          gain.connect(ctx.destination);
                          osc.frequency.setValueAtTime(600, ctx.currentTime);
                          gain.gain.setValueAtTime(0.08 * vol, ctx.currentTime);
                          osc.start();
                          osc.stop(ctx.currentTime + 0.08);
                        }
                      } catch(err) {}
                    }}
                    style={{ accentColor: 'var(--color-proyecto)' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
