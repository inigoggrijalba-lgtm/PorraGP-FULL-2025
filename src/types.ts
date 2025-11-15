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