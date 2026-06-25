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
  deck1_version_id?: number | null;
  deck2_version_id?: number | null;
  winner_id: number | null;
  first_player_id: number | null;
  format: MatchFormat | null;
  date_played: string | null;
  date_played_iso: string | null;
  notes: string;
  deck1: Deck | null;
  deck2: Deck | null;
  deck1_version?: DeckVersionSummary | null;
  deck2_version?: DeckVersionSummary | null;
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
  deck1_version_id?: number | null;
  deck2_version_id?: number | null;
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

export type CardPrinting = {
  id: number;
  card_id: number;
  set_code: string | null;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  product_url: string | null;
  source: string;
  external_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Card = {
  id: number;
  name: string;
  grade: number | null;
  nation: string | null;
  card_type: string;
  clan: string | null;
  race: string | null;
  power: number | null;
  shield: number | null;
  critical: number | null;
  trigger_type: string | null;
  skill_text: string;
  flavor_text: string;
  source: string;
  external_id: string | null;
  primary_printing: CardPrinting | null;
  printings: CardPrinting[];
  created_at: string | null;
  updated_at: string | null;
};

export type CreateCardPayload = {
  name: string;
  grade?: number | string | null;
  nation?: string | null;
  card_type: string;
  clan?: string | null;
  race?: string | null;
  power?: number | string | null;
  shield?: number | string | null;
  critical?: number | string | null;
  trigger_type?: string | null;
  skill_text?: string;
  flavor_text?: string;
  source?: string;
  external_id?: string | null;

  set_code?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  product_url?: string | null;

  printing?: CreateCardPrintingPayload;
};

export type UpdateCardPayload = Partial<CreateCardPayload>;

export type CreateCardPrintingPayload = {
  set_code?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  product_url?: string | null;
  source?: string;
  external_id?: string | null;
};

export type CardSearchParams = {
  q?: string;
  nation?: string;
  grade?: number | string | null;
  card_type?: string;
  limit?: number;
};

export type DeckVersionSummary = {
  id: number;
  deck_id: number;
  version_name: string;
  notes: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type DeckCardZone = "main" | "ride" | "g" | "token" | "other";

export type DeckCardEntry = {
  id: number;
  deck_version_id: number;
  card_id: number;
  printing_id: number | null;
  quantity: number;
  zone: DeckCardZone;
  sort_order: number;
  card: Card | null;
  printing: CardPrinting | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DeckVersion = {
  id: number;
  deck_id: number;
  version_name: string;
  notes: string;
  is_active: boolean;
  deck: Deck | null;
  cards: DeckCardEntry[];
  card_count: number;
  unique_card_count: number;
  totals_by_zone: Partial<Record<DeckCardZone, number>>;
  created_at: string | null;
  updated_at: string | null;
};

export type CreateDeckVersionPayload = {
  version_name?: string;
  notes?: string;
  is_active?: boolean;
};

export type UpdateDeckVersionPayload = Partial<CreateDeckVersionPayload>;

export type AddDeckCardPayload = {
  card_id: number;
  printing_id?: number | null;
  quantity?: number;
  zone?: DeckCardZone;
  sort_order?: number;
};

export type UpdateDeckCardPayload = {
  quantity?: number;
  printing_id?: number | null;
  zone?: DeckCardZone;
  sort_order?: number;
};