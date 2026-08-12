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

export type PerformanceRecord = {
  wins: number;
  losses: number;
  undecided: number;
  decided_games: number;
  logged_games: number;
  win_pct: number;
};

export type SpotlightMatch = {
  match_id: number;
  date_played: string | null;
  opponent_id: number | null;
  opponent_name: string;
  opponent_nation: string | null;
  result: "W" | "L" | "U";
  turn_order: "first" | "second" | "unknown";
  version_id: number | null;
  version_name: string | null;
};

export type SpotlightMatchup = PerformanceRecord & {
  opponent_id: number;
  opponent_name: string;
  opponent_nation: string | null;
  opponent_type: DeckType;
};

export type SpotlightInsight = {
  key: string;
  tone: "positive" | "warning" | "danger" | "accent" | "neutral";
  eyebrow: string;
  title: string;
  body: string;
  value: string;
};

export type PerformanceSpotlightResponse = {
  deck: Deck;
  overview: PerformanceRecord & {
    opponents_faced: number;
    first_match_at: string | null;
    last_match_at: string | null;
  };
  sample: {
    level: "early" | "developing" | "meaningful" | "established";
    label: string;
    message: string;
    decided_games: number;
  };
  recent_form: PerformanceRecord & {
    window: number;
    delta_percentage_points: number;
    trend: "early" | "rising" | "cooling" | "steady";
    trend_label: string;
    results: SpotlightMatch[];
  };
  streak: {
    result: "W" | "L" | null;
    length: number;
    label: string;
  };
  turn_order: {
    first: PerformanceRecord;
    second: PerformanceRecord;
    unknown: PerformanceRecord;
    edge_percentage_points: number | null;
  };
  matchups: {
    best: SpotlightMatchup | null;
    hardest: SpotlightMatchup | null;
    rows: SpotlightMatchup[];
    minimum_repeated_sample: number;
  };
  version: {
    active: DeckVersionSummary | null;
    active_record: PerformanceRecord;
    tagged_matches: number;
    available_versions: number;
  };
  insights: SpotlightInsight[];
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
  set_code?: string;
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
  deck_rules: {
    required_total: number;
    main_deck_limit: number;
    ride_deck_limit: number;
    core_card_count: number;
    main_deck_count: number;
    ride_deck_count: number;
    ride_grades: Array<number | null>;
    ride_nations: string[];
    is_complete: boolean;
    issues: string[];
  };
  created_at: string | null;
  updated_at: string | null;
};

export type CreateDeckVersionPayload = {
  version_name?: string;
  notes?: string;
  is_active?: boolean;
  source_version_id?: number;
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

export type CardImageAnalysisFields = {
  name: string;
  grade: string;
  nation: string;
  card_type: string;
  set_code: string;
  set_name: string;
  card_number: string;
  rarity: string;
};

export type CardImageAnalysisConfidence = Record<
  keyof CardImageAnalysisFields,
  number
>;

export type CardImageAnalysisResult = {
  provider: "mock" | "openai";
  fields: CardImageAnalysisFields;
  confidence: CardImageAnalysisConfidence;
  warnings: string[];
  raw_text?: string | null;
};

export type PaginatedCardsResponse = {
  items: Card[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
};

export type CardLibraryParams = CardSearchParams & {
  page?: number;
  page_size?: number;
};

export type CardSetOption = {
  code: string;
  name: string;
};

export type ManagedCardSet = CardSetOption & {
  usage_count: number;
};

export type CardFormOptions = {
  grades: number[];
  nations: string[];
  card_types: string[];
  sets: CardSetOption[];
};

export type AcquisitionPlanType = "new_build" | "existing_deck";
export type AcquisitionListSource = "empty" | "deck_version";
export type AcquisitionPlanStatus =
  | "planning"
  | "buying"
  | "waiting"
  | "complete"
  | "paused";
export type AcquisitionBuildMode = "physical" | "proxy" | "mixed";
export type AcquisitionItemStatus =
  | "needed"
  | "partial"
  | "ordered"
  | "owned";

export type AcquisitionPlanItem = {
  id: number;
  plan_id: number;
  card_id: number;
  printing_id: number | null;
  required_quantity: number;
  source_quantity: number;
  removed_quantity: number;
  target_quantity: number;
  owned_quantity: number;
  available_quantity: number;
  ordered_quantity: number;
  accounted_quantity: number;
  missing_quantity: number;
  overage_quantity: number;
  purchase_quantity: number;
  unit_price_cents: number;
  estimated_cost_cents: number;
  remaining_cost_cents: number;
  ordered_value_cents: number;
  status: AcquisitionItemStatus;
  notes: string;
  card: Card;
  printing: CardPrinting | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AcquisitionPlanSummary = {
  line_count: number;
  required_quantity: number;
  source_quantity: number;
  removed_quantity: number;
  owned_quantity: number;
  ordered_quantity: number;
  missing_quantity: number;
  overage_quantity: number;
  purchase_quantity: number;
  estimated_cost_cents: number;
  remaining_cost_cents: number;
  ordered_value_cents: number;
  progress: number;
  is_accounted_for: boolean;
  is_physically_complete: boolean;
};

export type AcquisitionPlan = {
  id: number;
  name: string;
  plan_type: AcquisitionPlanType;
  list_source: AcquisitionListSource;
  status: AcquisitionPlanStatus;
  build_mode: AcquisitionBuildMode;
  deck_id: number | null;
  deck_version_id: number | null;
  source_deck_version_id: number | null;
  deck_type: DeckType | null;
  nation: string | null;
  notes: string;
  deck: Deck | null;
  deck_version: DeckVersionSummary | null;
  source_deck_version: DeckVersionSummary | null;
  items: AcquisitionPlanItem[];
  summary: AcquisitionPlanSummary;
  created_at: string | null;
  updated_at: string | null;
};

export type CreateAcquisitionPlanPayload = {
  name: string;
  plan_type: AcquisitionPlanType;
  list_source: AcquisitionListSource;
  status?: AcquisitionPlanStatus;
  build_mode?: AcquisitionBuildMode;
  deck_id?: number | null;
  deck_version_id?: number | null;
  source_deck_version_id?: number | null;
  deck_type?: DeckType | null;
  nation?: string | null;
  notes?: string;
};

export type UpdateAcquisitionPlanPayload = Partial<
  Pick<
    AcquisitionPlan,
    "name" | "status" | "build_mode" | "deck_type" | "nation" | "notes"
  >
>;

export type AddAcquisitionItemPayload = {
  card_id: number;
  printing_id?: number | null;
  required_quantity?: number;
  source_quantity?: number;
  removed_quantity?: number;
  owned_quantity?: number;
  ordered_quantity?: number;
  unit_price_cents?: number;
  notes?: string;
};

export type UpdateAcquisitionItemPayload = Partial<
  Pick<
    AcquisitionPlanItem,
    | "printing_id"
    | "required_quantity"
    | "source_quantity"
    | "removed_quantity"
    | "owned_quantity"
    | "ordered_quantity"
    | "unit_price_cents"
    | "notes"
  >
> & {
  target_quantity?: number;
};
