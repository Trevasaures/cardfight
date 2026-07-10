import { useMemo, useState } from "react";
import { ArrowRight, RefreshCcw, Sparkles } from "lucide-react";

import { PageHeader } from "../components/layout/PageHeader";

const NATIONS = {
  dragon_empire: {
    name: "Dragon Empire",
    icon: "/nations/dragon_empire.png",
    summary: "Aggressive tempo, battlefield pressure, and relentless offense.",
    personality:
      "You like applying pressure early, pushing momentum, and making the opponent answer your pace.",
    traits: ["Aggressive tempo", "Front-foot pressure", "Combat focus", "Momentum"],
  },
  dark_states: {
    name: "Dark States",
    icon: "/nations/dark_states.png",
    summary: "High ceiling turns, explosive resources, and big-risk big-reward play.",
    personality:
      "You enjoy scaling into huge turns, building engines, and gambling a little for absurd payoff.",
    traits: ["Explosive turns", "Soul-driven engines", "High ceiling", "Risk / reward"],
  },
  brandt_gate: {
    name: "Brandt Gate",
    icon: "/nations/brandt_gate.png",
    summary: "Technical control, setplay, and efficient sequencing.",
    personality:
      "You prefer structure, setup, problem-solving, and making the board work on your terms.",
    traits: ["Control", "Set orders", "Technical planning", "Efficiency"],
  },
  keter_sanctuary: {
    name: "Keter Sanctuary",
    icon: "/nations/keter_sanctuary.png",
    summary: "Big swings, glass cannon pressure, and divine nonsense.",
    personality:
      "You like powerful turns that feel dramatic, superior calling, top-deck setup, and explosive pressure.",
    traits: ["Big swing turns", "Superior calling", "Top-deck setup", "Glass cannon pressure"],
  },
  stoicheia: {
    name: "Stoicheia",
    icon: "/nations/stoicheia.png",
    summary: "Flexible lines, layered advantage, and steady battlefield value.",
    personality:
      "You enjoy adaptability, board development, multi-attack patterns, and converting small edges over time.",
    traits: ["Flexibility", "Multi-attack value", "Resource layering", "Adaptability"],
  },
  lyrical_monasterio: {
    name: "Lyrical Monasterio",
    icon: "/nations/lyrical_monasterio.png",
    summary: "Synergy, style, expressive gameplay, and clever combo value.",
    personality:
      "You like identity-driven decks, elegant synergies, and gameplay that feels cohesive and expressive.",
    traits: ["Synergy", "Expressive decks", "Clever combo value", "Stylish play"],
  },
} as const;

type NationKey = keyof typeof NATIONS;

type Option = {
  label: string;
  hint?: string;
  scores: Partial<Record<NationKey, number>>;
};

type Question = {
  id: string;
  prompt: string;
  description: string;
  options: Option[];
};

const QUESTIONS: Question[] = [
  {
    id: "turns",
    prompt: "What kind of turn feels the most satisfying to you?",
    description: "Pick the play pattern that sounds the most fun.",
    options: [
      {
        label: "Explode with one absurd, high-payoff turn",
        hint: "Big ceiling, high reward",
        scores: { dark_states: 3, keter_sanctuary: 1 },
      },
      {
        label: "Apply pressure immediately and keep swinging",
        hint: "Aggression and pace",
        scores: { dragon_empire: 3, stoicheia: 1 },
      },
      {
        label: "Assemble a smart setup and out-sequence people",
        hint: "Setup and control",
        scores: { brandt_gate: 3, lyrical_monasterio: 1 },
      },
      {
        label: "Build a flexible board and pivot as needed",
        hint: "Value and adaptability",
        scores: { stoicheia: 3, lyrical_monasterio: 1 },
      },
    ],
  },
  {
    id: "risk",
    prompt: "How do you feel about risk?",
    description: "Choose the statement that sounds most like you.",
    options: [
      {
        label: "I love high-risk, high-reward gameplay",
        hint: "Let it ride",
        scores: { dark_states: 3, keter_sanctuary: 1 },
      },
      {
        label: "I want pressure, but still with a clear plan",
        hint: "Aggressive but directed",
        scores: { dragon_empire: 2, keter_sanctuary: 2 },
      },
      {
        label: "I prefer measured, technical consistency",
        hint: "Controlled and stable",
        scores: { brandt_gate: 3, stoicheia: 1 },
      },
      {
        label: "I like expressive synergy more than pure risk",
        hint: "Identity and cohesion",
        scores: { lyrical_monasterio: 3, stoicheia: 1 },
      },
    ],
  },
  {
    id: "resources",
    prompt: "What kind of resource engine sounds coolest?",
    description: "Think about what kind of payoff engine you enjoy building.",
    options: [
      {
        label: "Soul-charging and cashing in later",
        hint: "Soul as fuel",
        scores: { dark_states: 3 },
      },
      {
        label: "Orders, prison pieces, or technical setup tools",
        hint: "Structured engine",
        scores: { brandt_gate: 3 },
      },
      {
        label: "Superior calls and top-deck manipulation",
        hint: "Divine pressure",
        scores: { keter_sanctuary: 3 },
      },
      {
        label: "Board advantage, growth, and layered value",
        hint: "Steady advantage",
        scores: { stoicheia: 2, dragon_empire: 1, lyrical_monasterio: 1 },
      },
    ],
  },
  {
    id: "identity",
    prompt: "What kind of deck identity do you gravitate toward?",
    description: "This is more about vibe than pure mechanics.",
    options: [
      {
        label: "Power fantasy — I want my deck to feel huge",
        hint: "Big presence",
        scores: { dragon_empire: 2, keter_sanctuary: 2 },
      },
      {
        label: "Tricky, sharp, and very deliberate",
        hint: "Smart control",
        scores: { brandt_gate: 3 },
      },
      {
        label: "A stylish deck with clever internal synergy",
        hint: "Synergy and charm",
        scores: { lyrical_monasterio: 3 },
      },
      {
        label: "A scalable deck that can snowball over time",
        hint: "Layered growth",
        scores: { stoicheia: 2, dark_states: 2 },
      },
    ],
  },
  {
    id: "combat",
    prompt: "How do you want to win games?",
    description: "Choose the finishing style you enjoy most.",
    options: [
      {
        label: "Overwhelm with huge pressure and powerful attacks",
        hint: "Power and pace",
        scores: { dragon_empire: 2, keter_sanctuary: 2 },
      },
      {
        label: "Outlast and outmaneuver with value",
        hint: "Grinding and adapting",
        scores: { stoicheia: 3, brandt_gate: 1 },
      },
      {
        label: "Set up a huge payoff engine and cash out",
        hint: "Explosive payoff",
        scores: { dark_states: 3 },
      },
      {
        label: "Win through synergy, clever lines, and polish",
        hint: "Elegant gameplay",
        scores: { lyrical_monasterio: 3, brandt_gate: 1 },
      },
    ],
  },
  {
    id: "aesthetic",
    prompt: "Pick the vibe that sounds the most like you.",
    description: "Last one — pure flavor.",
    options: [
      {
        label: "Knights, angels, holy pressure, and destiny",
        scores: { keter_sanctuary: 3 },
      },
      {
        label: "Demons, soul power, greed, and spectacle",
        scores: { dark_states: 3 },
      },
      {
        label: "Science, tech, prisons, and tactical weirdness",
        scores: { brandt_gate: 3 },
      },
      {
        label: "Nature, dragons, beasts, idols, or coordinated style",
        scores: { stoicheia: 1, dragon_empire: 1, lyrical_monasterio: 2 },
      },
    ],
  },
];

type ScoreRow = {
  key: NationKey;
  score: number;
};

function buildEmptyScores(): Record<NationKey, number> {
  return {
    dragon_empire: 0,
    dark_states: 0,
    brandt_gate: 0,
    keter_sanctuary: 0,
    stoicheia: 0,
    lyrical_monasterio: 0,
  };
}

function getScoresFromAnswers(answers: number[]) {
  const scores = buildEmptyScores();

  answers.forEach((optionIndex, questionIndex) => {
    const question = QUESTIONS[questionIndex];
    const option = question?.options[optionIndex];

    if (!option) return;

    Object.entries(option.scores).forEach(([nation, value]) => {
      scores[nation as NationKey] += value ?? 0;
    });
  });

  return scores;
}

function sortScores(scores: Record<NationKey, number>): ScoreRow[] {
  return (Object.entries(scores) as [NationKey, number][])
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score);
}

function percent(score: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(6, Math.round((score / max) * 100));
}

export function NationQuiz() {
  const [answers, setAnswers] = useState<number[]>([]);

  const scores = useMemo(() => getScoresFromAnswers(answers), [answers]);
  const ranked = useMemo(() => sortScores(scores), [scores]);

  const currentQuestionIndex = Math.min(answers.length, QUESTIONS.length - 1);
  const complete = answers.length >= QUESTIONS.length;
  const currentQuestion = QUESTIONS[currentQuestionIndex];

  const top = ranked[0];
  const runnerUp = ranked[1];

  const topNation = top ? NATIONS[top.key] : null;
  const runnerUpNation = runnerUp ? NATIONS[runnerUp.key] : null;

  const isExactTie =
    complete &&
    Boolean(top && runnerUp) &&
    top.score > 0 &&
    runnerUp.score === top.score;

  const isNearTie =
    complete &&
    Boolean(top && runnerUp) &&
    top.score > 0 &&
    top.score - runnerUp.score === 1;

  const isSplitResult = isExactTie || isNearTie;

  const progressPct = Math.round((answers.length / QUESTIONS.length) * 100);

  function answerQuestion(optionIndex: number) {
    if (complete) return;
    setAnswers((prev) => [...prev, optionIndex]);
  }

  function resetQuiz() {
    setAnswers([]);
  }

  const resultTraits = useMemo(() => {
    if (!topNation) return [];

    if (!isSplitResult || !runnerUpNation) {
      return topNation.traits;
    }

    return [...topNation.traits, ...runnerUpNation.traits].slice(0, 6);
  }, [isSplitResult, runnerUpNation, topNation]);

  return (
    <>
      <PageHeader
        eyebrow="Nation Quiz"
        title="Find your Vanguard nation"
        description="Answer a few playstyle questions and get a just-for-fun Standard nation recommendation."
      />

      <section
        data-anime="motion-panel"
        className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Standard / D-Series
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-50">
              Nation Compass
            </h3>
          </div>

          <button
            type="button"
            onClick={resetQuiz}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09]"
          >
            <RefreshCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="px-5 pt-5">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-300/80 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {!complete ? (
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.5fr_0.85fr]">
            <section className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/5 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                Question {currentQuestionIndex + 1} of {QUESTIONS.length}
              </p>

              <h4 className="mt-3 text-3xl font-black text-slate-50">
                {currentQuestion.prompt}
              </h4>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                {currentQuestion.description}
              </p>

              <div className="mt-6 grid gap-3">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={`${currentQuestion.id}-${index}`}
                    type="button"
                    onClick={() => answerQuestion(index)}
                    className="group rounded-3xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-bold text-slate-100 transition group-hover:text-cyan-100">
                          {option.label}
                        </p>
                        {option.hint ? (
                          <p className="mt-1 text-sm text-slate-500">
                            {option.hint}
                          </p>
                        ) : null}
                      </div>

                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400 transition group-hover:border-cyan-300/30 group-hover:text-cyan-100">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <aside className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-200" />
                <p className="text-sm font-black text-slate-100">
                  Live leaning
                </p>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Your current top nations will show here while you answer.
              </p>

              <div className="mt-5 space-y-3">
                {ranked.map((row) => {
                  const nation = NATIONS[row.key];
                  const maxScore = ranked[0]?.score ?? 0;

                  return (
                    <div
                      key={row.key}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={nation.icon}
                          alt={nation.name}
                          className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 object-contain p-1"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-bold text-slate-200">
                              {nation.name}
                            </p>
                            <span className="text-xs font-bold text-slate-500">
                              {row.score} pts
                            </span>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-cyan-300/80 transition-all duration-500"
                              style={{ width: `${percent(row.score, maxScore)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.6fr_0.55fr]">
            <section className="rounded-[2rem] border border-cyan-300/25 bg-cyan-300/10 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                {isSplitResult ? "Split affinity" : "Your nation is"}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {topNation ? (
                  <img
                    src={topNation.icon}
                    alt={topNation.name}
                    className="h-20 w-20 rounded-3xl border border-cyan-300/20 bg-black/20 object-contain p-3"
                  />
                ) : null}

                {isSplitResult && runnerUpNation ? (
                  <>
                    <span className="text-2xl font-black text-slate-500">+</span>
                    <img
                      src={runnerUpNation.icon}
                      alt={runnerUpNation.name}
                      className="h-20 w-20 rounded-3xl border border-cyan-300/20 bg-black/20 object-contain p-3"
                    />
                  </>
                ) : null}
              </div>

              <h4 className="mt-5 text-5xl font-black tracking-tight text-slate-50">
                {isSplitResult && topNation && runnerUpNation
                  ? `${topNation.name} / ${runnerUpNation.name}`
                  : topNation?.name}
              </h4>

              <p className="mt-4 text-2xl font-bold text-cyan-100">
                {isSplitResult && topNation && runnerUpNation
                  ? `${topNation.summary} + ${runnerUpNation.summary}`
                  : topNation?.summary}
              </p>

              <p className="mt-6 max-w-4xl text-base leading-8 text-slate-400">
                {isSplitResult && topNation && runnerUpNation
                  ? `You didn’t land cleanly in one lane — which is honestly kind of sick. You’re split between ${topNation.name} and ${runnerUpNation.name}, which usually means you enjoy a blend of both playstyles.`
                  : topNation?.personality}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {resultTraits.map((trait) => (
                  <div
                    key={trait}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200"
                  >
                    {trait}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-slate-400">
                {isSplitResult && topNation && runnerUpNation
                  ? `Think of this result as your two strongest directions: ${topNation.name} is your primary pull, while ${runnerUpNation.name} is right beside it. If you’re choosing a first deck, either one is a valid fit.`
                  : topNation
                    ? `If this result feels right, ${topNation.name} is probably where you’ll feel most at home.`
                    : "No result available."}
              </div>

              <button
                type="button"
                onClick={resetQuiz}
                className="mt-7 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
              >
                <RefreshCcw className="h-4 w-4" />
                Retake quiz
              </button>
            </section>

            <aside className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
              <p className="text-lg font-black text-slate-100">Result breakdown</p>

              {isSplitResult && runnerUpNation ? (
                <p className="mt-3 text-sm text-slate-500">
                  Runner-up:{" "}
                  <span className="font-bold text-slate-300">
                    {runnerUpNation.name}
                  </span>
                </p>
              ) : runnerUpNation ? (
                <p className="mt-3 text-sm text-slate-500">
                  Runner-up:{" "}
                  <span className="font-bold text-slate-300">
                    {runnerUpNation.name}
                  </span>
                </p>
              ) : null}

              <div className="mt-6 space-y-4">
                {ranked.map((row) => {
                  const nation = NATIONS[row.key];
                  const maxScore = ranked[0]?.score ?? 0;

                  return (
                    <div key={row.key}>
                      <div className="flex items-center gap-3">
                        <img
                          src={nation.icon}
                          alt={nation.name}
                          className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.04] object-contain p-1"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-bold text-slate-200">
                              {nation.name}
                            </p>
                            <span className="text-xs font-bold text-slate-500">
                              {row.score} pts
                            </span>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-cyan-300/80 transition-all duration-500"
                              style={{ width: `${percent(row.score, maxScore)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </section>
    </>
  );
}