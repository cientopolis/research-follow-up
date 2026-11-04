import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Firebase SDK
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => {
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    getIdToken: vi.fn().mockResolvedValue('test-token-jwt'),
  };
  const mockAuth = {
    currentUser: mockUser,
    onAuthStateChanged: vi.fn((callback) => {
      callback(mockUser);
      return () => {};
    }),
  };
  return {
    getAuth: vi.fn(() => mockAuth),
    connectAuthEmulator: vi.fn(),
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({ user: mockUser }),
    createUserWithEmailAndPassword: vi.fn().mockResolvedValue({ user: mockUser }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChanged: vi.fn((authInstance, callback) => {
      callback(mockUser);
      return () => {};
    }),
  };
});

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  postMessage = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}
global.BroadcastChannel = MockBroadcastChannel as any;

// Mock AudioContext
class MockAudioContext {
  state = 'suspended';
  sampleRate = 44100;
  resume = vi.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  createOscillator = vi.fn().mockReturnValue({
    connect: vi.fn(),
    type: 'sine',
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    start: vi.fn(),
    stop: vi.fn(),
  });
  createGain = vi.fn().mockReturnValue({
    connect: vi.fn(),
    gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  });
  createBiquadFilter = vi.fn().mockReturnValue({
    connect: vi.fn(),
    type: 'bandpass',
    frequency: { value: 0, setValueAtTime: vi.fn() },
    Q: { value: 1 },
  });
  createBuffer = vi.fn().mockReturnValue({
    getChannelData: vi.fn().mockReturnValue(new Float32Array(1024)),
  });
  createBufferSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
    buffer: null,
    start: vi.fn(),
    stop: vi.fn(),
  });
  destination = {};
  currentTime = 0;
}
global.AudioContext = MockAudioContext as any;
(global as any).webkitAudioContext = MockAudioContext as any;

// Mock HTMLMediaElement and Audio for jsdom
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
}

// Mock Notification
global.Notification = class {
  static permission = 'default';
  static requestPermission = vi.fn().mockResolvedValue('granted');
  constructor() {}
} as any;

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });
