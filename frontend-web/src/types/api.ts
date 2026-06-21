export type DeckType = "Standard" | "Stride";
export type MatchFormat = DeckType | "Any";

export type Deck = {
  id: number;
  name: string;
  type: DeckType;
  nation: string | null;
  nation_icon: string | null;
  wins: number;
  losses: number;
  games: number;
  decided_games: number;
  win_pct: number;
  active: boolean;
  created_at?: string | null;
};

export type MatchResultStatus = "decided" | "undecided" | "invalid";

export type Match = {
  id: number;
  deck1_id: number;
  deck2_id: number;
  winner_id: number | null;
  first_player_id: number | null;
  format: MatchFormat | null;
  date_played: string | null;
  date_played_iso: string | null;
  notes: string;

  deck1: Deck | null;
  deck2: Deck | null;
  winner: Deck | null;
  first_player: Deck | null;

  deck1_name: string;
  deck2_name: string;
  winner_name: string | null;
  first_player_name: string | null;

  result_status: MatchResultStatus;
  is_decided: boolean;
  is_undecided: boolean;
};

export type CreateMatchPayload = {
  deck1_id: number;
  deck2_id: number;
  winner_id?: number | null;
  first_player_id?: number | null;
  format?: MatchFormat | null;
  notes?: string;
};

export type RandomMatchupResponse = {
  deck1: Deck;
  deck2: Deck;
  first_player: Deck;
  format: MatchFormat;
};

export type StatsRow = {
  deck_id: number;
  id: number;
  name: string;
  type: DeckType;
  active: boolean;
  wins: number;
  losses: number;
  undecided: number;
  games: number;
  decided_games: number;
  logged_games: number;
  win_pct: number;
  deck: Deck;
};

export type DashboardDeckSummary = {
  deck: Deck;
  wins: number;
  losses: number;
  undecided: number;
  decided_games: number;
  logged_games: number;
  win_pct: number;
};

export type DashboardResponse = {
  summary: {
    total_decks: number;
    active_decks: number;
    inactive_decks: number;
    total_matches: number;
    decided_matches: number;
    undecided_matches: number;
  };
  best_win_rate_deck: DashboardDeckSummary | null;
  most_played_deck: DashboardDeckSummary | null;
  recent_matches: Match[];
};

export type PaginatedMatchesResponse = {
  items: Match[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
};

export type DeckUpdatePayload = {
  name?: string;
  type?: DeckType;
  nation?: string | null;
  active?: boolean;
};

export type DeckOptionsResponse = {
  types: DeckType[];
  nations: {
    name: string;
    icon: string;
    icon_path: string;
  }[];
};