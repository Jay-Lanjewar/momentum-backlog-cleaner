import type { ChallengeQuestion, ChallengeSubject, Difficulty } from "./types";

function uniqueChoices(answer: string, others: string[]): string[] {
  return [answer, ...new Set(others.filter((item) => item !== answer))].slice(0, 4);
}

function fraction(n: number, d: number): string {
  let a = Math.abs(n);
  let b = Math.abs(d);
  while (b) [a, b] = [b, a % b];
  const divisor = a || 1;
  const numerator = n / divisor;
  const denominator = d / divisor;
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

function question(
  id: string, grade: number, board: string, subject: ChallengeSubject,
  topic: string, skill: string, difficulty: Difficulty, prompt: string,
  answer: string, distractors: string[], hint: string, explanation: string,
): ChallengeQuestion {
  return {
    id, version: 1, grades: [grade], board, subject, topic, skill,
    difficulty, requestedDifficulty: difficulty, prompt,
    answerType: "single-choice", correctAnswer: answer,
    choices: uniqueChoices(answer, distractors), hint, explanation,
  };
}

/** Deterministic, bounded parameterized practice for catalog difficulty gaps. */
export function generateQuestionVariation(
  topic: string,
  skill: string,
  grade: number,
  board: string,
  difficulty: Difficulty,
  variant: number,
): ChallengeQuestion | null {
  if (!Number.isSafeInteger(variant) || variant < 1 || variant > 10_000) return null;
  const id = `generated-v1:${topic}:${skill}:d${difficulty}:n${variant}`;
  const n = (base: number, mod: number) => base
    + Math.floor((variant - 1) / mod) * mod
    + ((variant - 1 + difficulty * 3) % mod);
  const answerQuestion = (prompt: string, answer: number, subject: ChallengeSubject, hint: string, explanation: string) =>
    question(id, grade, board, subject, topic, skill, difficulty, prompt, String(answer),
      [String(answer + 1), String(answer - 1), String(answer + 3)], hint, explanation);

  if (topic === "math-integers" && (skill === "integer-addition" || skill === "integer-subtraction")) {
    if (difficulty === 1) {
      const a = n(2, 7), b = n(2, 6);
      const op = skill === "integer-addition" ? "+" : "−";
      const result = skill === "integer-addition" ? a + b : a - b;
      return answerQuestion(`Calculate ${a} ${op} ${b}.`, result, "mathematics", "Work along a number line, respecting the sign.", `${a} ${op} ${b} = ${result}.`);
    }
    if (difficulty === 2) {
      const a = n(12, 18), b = n(15, 16);
      const signedA = variant % 2 ? -a : a;
      const signedB = variant % 3 ? b : -b;
      const op = skill === "integer-addition" ? "+" : "−";
      const result = skill === "integer-addition" ? signedA + signedB : signedA - signedB;
      return answerQuestion(`Calculate ${signedA} ${op} (${signedB}).`, result, "mathematics", "Rewrite subtraction as adding the opposite, if helpful.", `${signedA} ${op} (${signedB}) = ${result}.`);
    }
    const a = n(20, 25), b = n(11, 18), c = n(4, 12);
    const signedA = variant % 2 ? -a : a;
    const signedB = variant % 3 ? b : -b;
    const result = skill === "integer-addition" ? signedA + signedB - c : signedA - signedB + c;
    const prompt = skill === "integer-addition" ? `Calculate (${signedA}) + (${signedB}) − ${c}.` : `Calculate (${signedA}) − (${signedB}) + ${c}.`;
    return answerQuestion(prompt, result, "mathematics", "Evaluate one signed operation at a time.", `${prompt.replace("Calculate ", "")} = ${result}.`);
  }

  if (topic === "math-fractions" && skill === "fraction-equivalence") {
    const numerator = n(1, 4);
    const denominator = numerator + n(2, 5);
    const factor = difficulty === 1 ? n(2, 2) : difficulty === 2 ? n(3, 4) : n(6, 5);
    const answer = `${numerator * factor}/${denominator * factor}`;
    return question(id, grade, board, "mathematics", topic, skill, difficulty,
      `Which fraction is equivalent to ${numerator}/${denominator}?`, answer,
      [`${numerator * factor + 1}/${denominator * factor}`, `${numerator * factor}/${denominator * factor + 1}`, `${numerator}/${denominator * factor}`],
      "Multiply the numerator and denominator by the same factor.",
      `${numerator}/${denominator} × ${factor}/${factor} = ${answer}.`);
  }

  if (topic === "math-fractions" && skill === "fraction-addition") {
    const denominatorA = difficulty === 1 ? n(3, 5) : n(3, 4);
    const denominatorB = difficulty === 1 ? denominatorA : denominatorA + 1;
    const numeratorA = n(1, Math.max(2, denominatorA - 1));
    const numeratorB = n(1, Math.max(2, denominatorB - 1));
    const numerator = numeratorA * denominatorB + numeratorB * denominatorA;
    const denominator = denominatorA * denominatorB;
    const answer = fraction(numerator, denominator);
    return question(id, grade, board, "mathematics", topic, skill, difficulty,
      `What is ${numeratorA}/${denominatorA} + ${numeratorB}/${denominatorB}?`, answer,
      [`${numeratorA + numeratorB}/${denominatorA + denominatorB}`, fraction(numerator - 1, denominator), `${numerator}/${denominator + 1}`],
      "Find a common denominator, add the numerators, then simplify.",
      `A common denominator is ${denominator}; the sum simplifies to ${answer}.`);
  }

  if (topic === "math-linear-equations" && (skill === "one-step-equations" || skill === "two-step-equations")) {
    const x = n(2, 9);
    const a = n(2, 5);
    const b = n(2, 8);
    if (skill === "one-step-equations") {
      if (difficulty === 1) return answerQuestion(`Solve: x + ${a} = ${x + a}`, x, "mathematics", "Subtract the same number from both sides.", `x = ${x + a} − ${a} = ${x}.`);
      if (difficulty === 2) return answerQuestion(`Solve: ${a}x = ${a * x}`, x, "mathematics", "Divide both sides by the coefficient of x.", `${a}x = ${a * x}, so x = ${x}.`);
      return answerQuestion(`Solve: x/${a} − ${b} = ${x / a - b}`, x, "mathematics", "Undo subtraction first, then multiply by the denominator.", `Adding ${b} and multiplying by ${a} gives x = ${x}.`);
    }
    if (difficulty === 1) return answerQuestion(`Solve: ${a}x + ${b} = ${a * x + b}`, x, "mathematics", "Undo addition, then divide by the coefficient.", `(${a * x + b} − ${b}) ÷ ${a} = ${x}.`);
    if (difficulty === 2) return answerQuestion(`Solve: ${a}x − ${b} = ${a * x - b}`, x, "mathematics", "Add the constant to both sides, then divide.", `(${a * x - b} + ${b}) ÷ ${a} = ${x}.`);
    return answerQuestion(`Solve: ${a}(x + ${b}) = ${a * (x + b)}`, x, "mathematics", "Divide both sides by the outside coefficient, then subtract.", `x + ${b} = ${x + b}, so x = ${x}.`);
  }

  if (topic === "math-ratios" && skill === "ratios") {
    const first = n(2, 4), second = n(3, 5), scale = difficulty === 1 ? 2 : difficulty === 2 ? 4 : 7;
    return answerQuestion(`A mixture uses ${first} cups of juice for every ${second} cups of water. How many cups of juice are needed for ${second * scale} cups of water?`, first * scale, "mathematics", "Use the same scale factor for both parts of the ratio.", `The water amount is multiplied by ${scale}, so juice is ${first} × ${scale} = ${first * scale} cups.`);
  }

  if (topic === "math-ratios" && skill === "percentages") {
    const percent = difficulty === 1 ? 10 : difficulty === 2 ? 20 : 15;
    const amount = difficulty === 1 ? n(30, 7) * 10 : difficulty === 2 ? n(15, 8) * 5 : n(40, 7) * 4;
    const valueHundredths = Math.round(amount * percent);
    const value = valueHundredths / 100;
    const isDiscount = difficulty === 3;
    const answer = (isDiscount ? amount * 100 - valueHundredths : valueHundredths) / 100;
    const prompt = isDiscount ? `A price of ${amount} is reduced by ${percent}%. What is the new price?` : `What is ${percent}% of ${amount}?`;
    return answerQuestion(prompt, answer, "mathematics", "Convert the percent to a fraction of 100, then multiply.", isDiscount ? `${percent}% of ${amount} is ${value}; ${amount} − ${value} = ${answer}.` : `${percent}/100 × ${amount} = ${answer}.`);
  }

  if (topic === "physics-motion" && (skill === "speed" || skill === "distance-time")) {
    if (skill === "speed") {
      const distance = difficulty === 1 ? n(5, 8) * 10 : difficulty === 2 ? n(3, 8) * 30 : n(4, 9) * 100;
      const time = difficulty === 1 ? 5 : difficulty === 2 ? 10 : 20;
      const speed = distance / time;
      return question(id, grade, board, "physics", topic, skill, difficulty,
        `An object travels ${distance} m in ${time} s. What is its average speed?`, `${speed} m/s`,
        [`${distance + time} m/s`, `${time / distance} m/s`, `${distance * time} m/s`],
        "Average speed equals distance divided by time.", `${distance} ÷ ${time} = ${speed} m/s.`);
    }
    if (difficulty < 3) {
      const speed = difficulty === 1 ? n(2, 7) : n(3, 9);
      const time = difficulty === 1 ? n(4, 8) : n(10, 8);
      return question(id, grade, board, "physics", topic, skill, difficulty,
        `A runner moves at ${speed} m/s for ${time} s. How far does the runner travel?`, `${speed * time} m`,
        [`${speed + time} m`, `${time / speed} m`, `${speed * time + speed} m`],
        "Distance equals speed multiplied by time.", `${speed} × ${time} = ${speed * time} m.`);
    }
    return question(id, grade, board, "physics", topic, skill, difficulty,
      "A vehicle travels at 72 km/h for 20 minutes. How far does it travel?", "24 km",
      ["18 km", "36 km", "1440 km"],
      "Convert 20 minutes to one third of an hour.", "72 × 1/3 = 24 km.");
  }

  if (topic === "chem-atoms" && skill === "chemical-formulae") {
    const cations = [["sodium", 1, "Na"], ["magnesium", 2, "Mg"], ["aluminium", 3, "Al"], ["calcium", 2, "Ca"], ["potassium", 1, "K"]] as const;
    const anions = [["chlorine", 1, "Cl"], ["oxygen", 2, "O"], ["fluorine", 1, "F"], ["sulfur", 2, "S"], ["bromine", 1, "Br"]] as const;
    if (variant > cations.length * anions.length) return null;
    const cation = cations[Math.floor((variant - 1) / anions.length) % cations.length];
    const anion = anions[(variant - 1) % anions.length];
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const cationCount = anion[1] / gcd(cation[1], anion[1]);
    const anionCount = cation[1] / gcd(cation[1], anion[1]);
    const formula = `${cation[2]}${cationCount > 1 ? cationCount : ""}${anion[2]}${anionCount > 1 ? anionCount : ""}`;
    return question(id, grade, board, "chemistry", topic, skill, difficulty,
      `Using the stated valencies, which formula balances ${cation[0]} (valency ${cation[1]}) and ${anion[0]} (valency ${anion[1]})?`, formula,
      [`${cation[2]}${anion[2]}`, `${cation[2]}2${anion[2]}`, `${cation[2]}${anion[2]}2`], "Balance the total valencies using the smallest whole-number ratio.", `The valencies balance in ${formula}.`);
  }

  if (topic === "chem-atoms" && skill === "molecular-mass") {
    if (variant > 2) return null;
    const carbonCount = (difficulty - 1) * 2 + 1 + ((variant - 1) % 2);
    const hydrogenCount = 2 * carbonCount + 2;
    const formula = `C${carbonCount === 1 ? "" : carbonCount}H${hydrogenCount}`;
    const masses = "C = 12 u; H = 1 u";
    const mass = 12 * carbonCount + hydrogenCount;
    const prompt = `Using ${masses}, what is the molecular mass of ${formula}?`;
    return question(id, grade, board, "chemistry", topic, skill, difficulty,
      prompt, `${mass} u`, [`${mass - 1} u`, `${mass + 2} u`, `${mass * 2} u`],
      "Multiply each atomic mass by its subscript, then add.", `${formula} has a total molecular mass of ${mass} u.`);
  }

  if (topic === "english-agreement" && skill === "verb-agreement") {
    if (variant > 6) return null;
    const noun = ["players", "artists", "readers", "scientists", "teachers", "runners"][(variant - 1) % 6];
    const subject = difficulty === 1
      ? `Each of the ${noun}`
      : difficulty === 2
        ? `The ${noun} in this group`
        : `Neither the coach nor the ${noun}`;
    const answer = difficulty === 1 ? "has" : difficulty === 2 ? "are" : "are";
    const verbOptions = difficulty === 1 ? ["has", "have", "is", "are"] : ["are", "is", "has", "have"];
    return question(id, grade, board, "english", topic, skill, difficulty,
      `Choose the verb that agrees: “${subject} ___ a clear explanation.”`, answer, verbOptions,
      "Find the grammatical subject and check whether it is singular or plural.", difficulty === 3
        ? `With “neither…nor,” the verb agrees with the nearer subject, “${noun},” which is plural.`
        : `The subject takes “${answer}” in this sentence.`);
  }

  if (topic === "english-parts" && skill === "parts-of-speech") {
    const examples = [
      ["The careful student checked the answer.", "careful", "adjective", "careful describes the noun student"],
      ["The runner moved swiftly along the track.", "swiftly", "adverb", "swiftly describes how the runner moved"],
      ["Birds migrate each autumn.", "migrate", "verb", "migrate names the action"],
      ["We placed the book beside the lamp.", "beside", "preposition", "beside shows the relationship between book and lamp"],
    ] as const;
    if (variant > examples.length) return null;
    const [sentence, word, answer, reason] = examples[(variant - 1) % examples.length];
    return question(id, grade, board, "english", topic, skill, difficulty,
      `In “${sentence}” what part of speech is “${word}”?`, answer,
      ["noun", "verb", "adjective", "adverb"], "Consider the role the selected word plays in its sentence.", `${word} is a ${answer}: ${reason}.`);
  }

  return null;
}

export function supportsQuestionVariations(topic: string, skill: string, grade: number, board: string): boolean {
  return generateQuestionVariation(topic, skill, grade, board, 1, 1) !== null;
}
