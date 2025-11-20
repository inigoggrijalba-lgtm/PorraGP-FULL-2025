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

// Fix: Manually define process to fix "process is not defined" errors during build
declare var process: {
  env: {
    API_KEY: string;
    [key: string]: string | undefined;
  }
};

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

// --- MotoGP Live Timing API Types ---
export interface LiveTimingHead {
    championship_id: string;
    category: string;
    circuit_id: string;
    circuit_name: string;
    event_id: string;
    session_id: string;
    session_name: string;
    remaining: string;
    session_status_name: string;
    date_formated: string;
}

export interface LiveTimingRider {
    order: number;
    rider_id: number;
    status_name: string;
    rider_number: string;
    pos: number;
    rider_shortname: string;
    rider_name: string;
    rider_surname: string;
    lap_time: string;
    num_lap: number;
    last_lap_time: string;
    team_name: string;
    bike_name: string;
    gap_first: string;
    gap_prev: string;
    on_pit: boolean;
    color: string;
    text_color: string;
}

export interface LiveTimingData {
  head: LiveTimingHead;
  rider: Record<string, LiveTimingRider>;
}

// --- MotoGP API Types ---
export interface ApiSeason {
  id: string;
  year: number;
  current: boolean;
}

// Categorías para la API de Resultados (Results API)
export interface ApiCategoryResult {
    id: string;
    name: string;
    legacy_id: number;
}

// Eventos para la API de Resultados (Results API)
export interface ApiEventResult {
    id: string;
    name: string;
    sponsored_name: string;
    short_name: string;
    status: string; // 'FINISHED', 'NOT-STARTED', etc.
    date_start: string;
    date_end: string;
    season: {
        id: string;
        year: number;
        current: boolean;
    };
    circuit: {
        id: string;
        name: string;
        place: string;
        nation: string;
    };
}

// Sesiones para la API de Resultados (Results API)
export interface ApiSessionResult {
    id: string;
    type: string; // 'FP', 'Q', 'RAC', 'SPR', 'WUP', 'PR'
    number: number | null;
    status: string; // 'FINISHED'
    date: string;
    condition?: {
        track: string;
        air: string;
        humidity: string;
        ground: string;
        weather: string;
    };
}

// Clasificación Detallada para la API de Resultados (Results API)
export interface ApiClassificationItem {
    id: string;
    position: number | null;
    points?: number;
    status: string; // 'INSTND', 'OUTSTND'
    rider: {
        id: string;
        full_name: string;
        number: number | null;
        country: {
            iso: string;
            name: string;
        };
    };
    team: {
        id: string;
        name: string;
    } | null;
    constructor: {
        id: string;
        name: string;
    } | null;
    // Campos específicos de Entrenamientos/Qualy
    best_lap?: {
        time: string;
        number: number | null;
    };
    top_speed?: number;
    // Campos específicos de Carrera
    time?: string;
    total_laps?: number;
    average_speed?: number;
    gap?: {
        first?: string;
        prev?: string;
        lap?: string;
    };
}

export interface ApiClassificationResponse {
    classification: ApiClassificationItem[];
    file?: string;
}

// Tipos Legacy para compatibilidad con otras partes
export interface ApiCategory {
    id: string;
    name: string;
    legacy_id: number;
}

export interface ApiAsset {
    id: string;
    name: string;
    type: string;
    path: string;
}

export interface ApiCircuitDescription {
    language: string;
    description: string;
}

export interface ApiTrack {
    lenght: string;
    width: string;
    longest_straight: string;
    left_corners: string;
    right_corners: string;
    assets: {
        info?: { path: string };
        simple?: { path: string };
    };
}

export interface ApiCircuit {
    id: string;
    name: string;
    place_id?: string;
    city?: string;
    country?: string;
    track?: ApiTrack;
    circuit_descriptions: ApiCircuitDescription[];
}

export interface ApiEvent {
    id: string;
    name: string;
    date_start: string;
    date_end: string;
    status: string;
    assets: ApiAsset[];
    circuit: ApiCircuit;
    country: string;
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
        type: string; // 'Official', 'Substitute', 'Wildcard'
        team: {
            id: string;
            name: string;
            picture: string;
            color?: string;
            text_color?: string;
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
        team: {
            id: string;
            name: string;
            picture: string;
            constructor: {
                name: string;
            };
            color?: string;
            text_color?: string;
        };
        category: {
            id: string;
            name: string;
            legacy_id: number;
        };
        current: boolean;
        type: string;
        pictures: {
            profile: { main: string | null, secondary: string | null };
            bike: { main: string | null, secondary: string | null };
            helmet: { main: string | null, secondary: string | null };
            number: string | null;
            portrait: string | null;
        };
    }[];
    published: boolean;
}

export interface RiderStats {
    podiums: { total: number; categories: any[] };
    poles: { total: number; categories: any[] };
    race_fastest_laps: { total: number; categories: any[] };
    grand_prix_victories: { total: number; categories: any[] };
    world_championship_wins: { total: number; categories: any[] };
    all_races: { total: number; categories: any[] };
    first_grand_prix?: any[];
    first_podiums?: any[];
    first_grand_prix_victories?: any[];
    first_pole_positions?: any[];
    first_race_fastest_lap?: any[];
}

export interface RiderSeasonStat {
    season: string;
    category: string;
    constructor: string;
    starts: number;
    first_position: number;
    second_position: number;
    third_position: number;
    podiums: number;
    poles: number;
    points: number;
    position: number;
}