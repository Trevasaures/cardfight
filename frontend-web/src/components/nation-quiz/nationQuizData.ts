export type NationId =
  | "dragonEmpire"
  | "darkStates"
  | "brandtGate"
  | "keterSanctuary"
  | "stoicheia"
  | "lyricalMonasterio";

export type NationScoreMap = Record<NationId, number>;

export type NationQuizAnswer = {
  id: string;
  label: string;
  description: string;
  scores: Partial<NationScoreMap>;
};

export type NationQuizQuestion = {
  id: string;
  eyebrow: string;
  question: string;
  answers: NationQuizAnswer[];
};

export type NationProfile = {
  id: NationId;
  name: string;
  tagline: string;
  summary: string;
  playstyle: string[];
  vibe: string;
};

export const EMPTY_NATION_SCORES: NationScoreMap = {
  dragonEmpire: 0,
  darkStates: 0,
  brandtGate: 0,
  keterSanctuary: 0,
  stoicheia: 0,
  lyricalMonasterio: 0,
};

export const NATION_PROFILES: Record<NationId, NationProfile> = {
  dragonEmpire: {
    id: "dragonEmpire",
    name: "Dragon Empire",
    tagline: "Pressure, removal, and decisive aggression.",
    summary:
      "You like forcing the issue. Dragon Empire rewards players who want to pressure early, remove key pieces, and make the opponent answer your board before they are ready.",
    playstyle: [
      "Aggressive tempo",
      "Retire/removal tools",
      "Clean pressure turns",
      "Direct, proactive game plans",
    ],
    vibe: "You are not here to ask permission. You are here to swing first and make them have the answer.",
  },
  darkStates: {
    id: "darkStates",
    name: "Dark States",
    tagline: "High ceiling, high risk, high reward.",
    summary:
      "You like explosive turns, resource engines, and big payoff moments. Dark States tends to reward players who enjoy managing soul, gambling a little, and building toward turns that can get absolutely ridiculous.",
    playstyle: [
      "Soul-charge engines",
      "Combo payoff turns",
      "Variance management",
      "Explosive power ceiling",
    ],
    vibe: "You saw the warning label and treated it like a suggestion.",
  },
  brandtGate: {
    id: "brandtGate",
    name: "Brandt Gate",
    tagline: "Setup, control, tech, and inevitability.",
    summary:
      "You like having a plan. Brandt Gate often appeals to players who enjoy orders, zones, prisons, machines, and technical setups that make the opponent play your game.",
    playstyle: [
      "Control and disruption",
      "Set orders and setup pieces",
      "Defensive planning",
      "Technical sequencing",
    ],
    vibe: "You brought a spreadsheet to a cardfight and somehow made it stylish.",
  },
  keterSanctuary: {
    id: "keterSanctuary",
    name: "Keter Sanctuary",
    tagline: "Big swings, glass cannon pressure, and divine nonsense.",
    summary:
      "You like powerful turns that feel dramatic. Keter Sanctuary is for players who enjoy building toward huge pressure, superior calls, top-deck manipulation, and occasionally living the glass cannon lifestyle.",
    playstyle: [
      "Big swing turns",
      "Superior calling",
      "Top-deck setup",
      "Explosive but punishable pressure",
    ],
    vibe: "You believe in destiny, lethal math, and making one turn everyone else's problem.",
  },
  stoicheia: {
    id: "stoicheia",
    name: "Stoicheia",
    tagline: "Board building, recursion, and layered advantage.",
    summary:
      "You like flexible boards, graveyard/drop-zone value, multi-attack patterns, and growing advantage over time. Stoicheia rewards players who enjoy turning small pieces into a full ecosystem.",
    playstyle: [
      "Board development",
      "Recursion and resource loops",
      "Multi-attack pressure",
      "Flexible midrange plans",
    ],
    vibe: "You planted one card and somehow harvested an entire board state.",
  },
  lyricalMonasterio: {
    id: "lyricalMonasterio",
    name: "Lyrical Monasterio",
    tagline: "Theme, flexibility, tempo, and being gay.",
    summary:
      "You care about the deck’s identity as much as the line of play. Lyrical Monasterio appeals to players who enjoy expressive archetypes, tempo, flexible patterns, and decks with a strong visual/personality hook.",
    playstyle: [
      "Archetype-driven gameplay",
      "Flexible tempo",
      "Theme-forward decks",
      "Unexpected lines",
    ],
    vibe: "You came for the aesthetic and stayed because the deck was secretly cooking.",
  },
};

export const NATION_QUIZ_QUESTIONS: NationQuizQuestion[] = [
  {
    id: "playstyle",
    eyebrow: "Question 1",
    question: "What kind of game plan sounds the most fun?",
    answers: [
      {
        id: "pressure",
        label: "Hit fast and keep the opponent uncomfortable.",
        description: "I want to apply pressure early and force awkward choices.",
        scores: { dragonEmpire: 3, keterSanctuary: 1 },
      },
      {
        id: "combo",
        label: "Build toward one huge payoff turn.",
        description: "I like setup, resource engines, and explosive turns.",
        scores: { darkStates: 3, stoicheia: 1 },
      },
      {
        id: "control",
        label: "Slow them down and make them play my game.",
        description: "I want disruption, setup pieces, and control tools.",
        scores: { brandtGate: 3, dragonEmpire: 1 },
      },
      {
        id: "board",
        label: "Build a board that keeps coming back.",
        description: "I like layered advantage, recursion, and flexible boards.",
        scores: { stoicheia: 3, lyricalMonasterio: 1 },
      },
      {
        id: "style",
        label: "I want the deck to have personality.",
        description: "Theme, identity, and style matter as much as winning.",
        scores: { lyricalMonasterio: 3, keterSanctuary: 1 },
      },
    ],
  },
  {
    id: "risk",
    eyebrow: "Question 2",
    question: "How much risk do you like in your deck?",
    answers: [
      {
        id: "high-risk",
        label: "Give me the dangerous ceiling.",
        description: "I accept variance if the payoff turn is absurd.",
        scores: { darkStates: 3, keterSanctuary: 2 },
      },
      {
        id: "medium-risk",
        label: "Some risk is fine if I can plan around it.",
        description: "I want power, but I still want meaningful control.",
        scores: { keterSanctuary: 2, stoicheia: 2, dragonEmpire: 1 },
      },
      {
        id: "low-risk",
        label: "I prefer consistency and clear lines.",
        description: "I want my deck to do the thing reliably.",
        scores: { brandtGate: 2, dragonEmpire: 2, lyricalMonasterio: 1 },
      },
      {
        id: "adaptive-risk",
        label: "I like flexible risk based on matchup.",
        description: "Sometimes I pressure, sometimes I grind.",
        scores: { stoicheia: 2, lyricalMonasterio: 2, brandtGate: 1 },
      },
    ],
  },
  {
    id: "resource",
    eyebrow: "Question 3",
    question: "Which resource pattern sounds most satisfying?",
    answers: [
      {
        id: "soul",
        label: "Soul-charge and cash out later.",
        description: "I like loading resources and gambling toward big turns.",
        scores: { darkStates: 3 },
      },
      {
        id: "orders",
        label: "Set up pieces that change the game.",
        description: "I like orders, zones, prisons, bases, or machines.",
        scores: { brandtGate: 3 },
      },
      {
        id: "drop",
        label: "Use the drop zone as a second hand.",
        description: "I like recursion and getting value from used pieces.",
        scores: { stoicheia: 3 },
      },
      {
        id: "topdeck",
        label: "Stack, reveal, or call from the top.",
        description: "I like manipulating what comes next.",
        scores: { keterSanctuary: 3 },
      },
      {
        id: "retire",
        label: "Remove their board and keep swinging.",
        description: "I like clearing threats while advancing my own plan.",
        scores: { dragonEmpire: 3 },
      },
      {
        id: "theme-engine",
        label: "A unique archetype engine.",
        description: "I like when each deck feels like its own little world.",
        scores: { lyricalMonasterio: 3 },
      },
    ],
  },
  {
    id: "combat",
    eyebrow: "Question 4",
    question: "What kind of attack turn feels best?",
    answers: [
      {
        id: "huge-vanguard",
        label: "One massive vanguard swing.",
        description: "Big number, big moment, big pressure.",
        scores: { keterSanctuary: 3, darkStates: 1 },
      },
      {
        id: "multiattack",
        label: "Multiple attacks from a built board.",
        description: "I like sequencing attacks and squeezing value.",
        scores: { stoicheia: 3, lyricalMonasterio: 1 },
      },
      {
        id: "clean-pressure",
        label: "Simple, efficient pressure.",
        description: "I want every column to matter.",
        scores: { dragonEmpire: 3 },
      },
      {
        id: "late-payoff",
        label: "A setup turn finally paying off.",
        description: "I want the opponent to realize the trap was already live.",
        scores: { brandtGate: 3, darkStates: 1 },
      },
      {
        id: "surprise-line",
        label: "Something weird and unexpected.",
        description: "I like unusual lines that make the deck feel expressive.",
        scores: { lyricalMonasterio: 3, brandtGate: 1 },
      },
    ],
  },
  {
    id: "personality",
    eyebrow: "Question 5",
    question: "Pick the most accurate goblin brain statement.",
    answers: [
      {
        id: "fight-now",
        label: "Why wait? The opponent has damage to take.",
        description: "Tempo, pressure, and aggression are the point.",
        scores: { dragonEmpire: 3 },
      },
      {
        id: "casino",
        label: "Surely the soul-charge hits exactly what I need.",
        description: "Variance is just spice with consequences.",
        scores: { darkStates: 3 },
      },
      {
        id: "systems",
        label: "Everything is going according to the diagram.",
        description: "Setup decks and control tools make me happy.",
        scores: { brandtGate: 3 },
      },
      {
        id: "divine",
        label: "If this works, it will be extremely funny.",
        description: "Glass cannon turns and huge swings are my love language.",
        scores: { keterSanctuary: 3 },
      },
      {
        id: "garden",
        label: "Every piece becomes another piece later.",
        description: "I like recursive value and board development.",
        scores: { stoicheia: 3 },
      },
      {
        id: "aesthetic",
        label: "The deck has to pass the vibe check.",
        description: "Theme and personality matter. I will not apologize.",
        scores: { lyricalMonasterio: 3 },
      },
    ],
  },
  {
    id: "defense",
    eyebrow: "Question 6",
    question: "When the game gets tense, what do you trust most?",
    answers: [
      {
        id: "ending",
        label: "Ending the game before it gets worse.",
        description: "My defense is making them dead first.",
        scores: { dragonEmpire: 2, keterSanctuary: 2 },
      },
      {
        id: "ceiling",
        label: "Drawing into the line that blows the game open.",
        description: "I believe in the payoff turn.",
        scores: { darkStates: 3 },
      },
      {
        id: "tools",
        label: "Having the right control piece ready.",
        description: "I want answers, not prayers.",
        scores: { brandtGate: 3 },
      },
      {
        id: "resources",
        label: "Having more usable pieces than the opponent.",
        description: "I trust resource loops and flexible boards.",
        scores: { stoicheia: 3 },
      },
      {
        id: "tempo",
        label: "Keeping enough tempo to pivot.",
        description: "I like decks that can shift plans when needed.",
        scores: { lyricalMonasterio: 2, stoicheia: 1, brandtGate: 1 },
      },
    ],
  },
];