// Fix: Manually define types for import.meta.env as a workaround for "vite/client" resolution issues.
// This resolves errors related to 'import.meta.env' and the inability to find 'vite/client' type definitions.
declare global {
  interface ImportMetaEnv {
    readonly BUILD_TIMESTAMP?: string;
    // fix: Add BASE_URL to fix TypeScript error in src/App.tsx
    readonly BASE_URL?: string;
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

// fix: Define LiveTimingResponse to resolve import error in motogpApiService.ts
export type LiveTimingResponse = Record<string, any>;

// --- MotoGP API Types for InfoPruebaTab ---
export interface ApiSeason {
  id: string;
  year: number;
  current: boolean;
}

export interface ApiCategory {
    id: string;
    name: string;
    legacy_id: number;
}

export interface ApiRider {
    id: string;
    legacy_id: number;
    name: string;
    surname: string;
    nickname: string | null;
    birth_date: string;
    birth_city: string;
    years_old: number;
    country: {
        iso: string;
        name: string;
        flag: string;
    };
    physical_attributes?: {
        height: number;
        weight: number;
    };
    current_career_step: {
        season: number;
        number: number;
        team: {
            id: string;
            name: string;
            picture: string;
            constructor: {
                name: string;
            }
        };
        category: {
            name: string;
        };
        pictures: {
            profile: { main: string | null, secondary: string | null };
            bike: { main: string | null, secondary: string | null };
            helmet: { main: string | null, secondary: string | null };
            number: string | null;
            portrait: string | null;
        };
    };
    career: {
        season: number;
        number: number;
        sponsored_team: string;
        category: { name: string };
    }[];
    published: boolean;
}