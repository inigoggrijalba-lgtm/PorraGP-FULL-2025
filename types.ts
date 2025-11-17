// Fix: Manually define types for import.meta.env as a workaround for "vite/client" resolution issues.
// This resolves errors related to 'import.meta.env' and the inability to find 'vite/client' type definitions.
declare global {
  interface ImportMetaEnv {
    readonly BUILD_TIMESTAMP: string;
    // fix: Add BASE_URL to fix TypeScript error in App.tsx
    readonly BASE_URL: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export interface Race {
  circuit: string;
  date: string;
  time: string;
}

export interface PlayerScore {
  player: string;
  totalPoints: number;
  pointsPerRace: number[];
}

export interface PlayerVote {
  player: string;
  votesPerRace: string[];
}

export interface DriverVoteCount {
    driver: string;
    votesByPlayer: Record<string, number>;
    totalVotes: number;
}

export interface RaceResult {
    position: number;
    driver: string;
    points: number;
}

export interface CircuitResult {
    circuit: string;
    sprint: RaceResult[];
    race: RaceResult[];
}

export interface MotoGpData {
  races: Race[];
  standings: PlayerScore[];
  playerVotes: PlayerVote[];
  driverVoteCounts: DriverVoteCount[];
  motogpResults: CircuitResult[];
  allDrivers: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Article {
  title: string;
  link: string;
  description: string;
  imageUrl: string;
  pubDate: string;
}