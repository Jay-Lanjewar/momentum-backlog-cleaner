import type { ChallengeQuestion, ChallengeSubject, Difficulty } from "./types";

const q = (
  id: string, grades: number[], board: string, subject: ChallengeSubject, topic: string,
  skill: string, difficulty: Difficulty, prompt: string, correctAnswer: string | number,
  choices: string[], hint: string, explanation: string,
): ChallengeQuestion => ({
  id, version: 1, grades, board, subject, topic, skill, difficulty, prompt,
  answerType: "single-choice", correctAnswer, choices, hint, explanation,
});

/** Original, locally authored practice items. No textbook question text is copied. */
export const QUESTIONS: readonly ChallengeQuestion[] = [
  q("int-01", [6, 7, 8], "general", "mathematics", "math-integers", "integer-addition", 1, "What is −7 + 12?", "5", ["5", "−19", "19", "−5"], "Start at −7 on a number line and move 12 steps right.", "Adding a positive number moves right: −7 + 12 = 5."),
  q("int-02", [6, 7, 8], "general", "mathematics", "math-integers", "integer-subtraction", 1, "What is 4 − 9?", "−5", ["5", "−5", "13", "−13"], "Subtracting 9 means move 9 steps left from 4.", "4 − 9 = 4 + (−9) = −5."),
  q("int-03", [7, 8], "general", "mathematics", "math-integers", "integer-addition", 2, "A temperature is −3°C, then rises by 8°C. What is it now?", "5°C", ["5°C", "−11°C", "11°C", "−5°C"], "Combine −3 and +8.", "−3 + 8 = 5, so the temperature is 5°C."),
  q("frac-01", [6, 7, 8], "general", "mathematics", "math-fractions", "fraction-equivalence", 1, "Which fraction is equivalent to 3/4?", "6/8", ["6/8", "3/8", "4/6", "9/16"], "Multiply the numerator and denominator by the same number.", "3/4 × 2/2 = 6/8."),
  q("frac-02", [6, 7, 8], "general", "mathematics", "math-fractions", "fraction-addition", 1, "What is 1/4 + 2/4?", "3/4", ["3/4", "3/8", "1/2", "2/4"], "The denominators already match, so add the numerators.", "(1 + 2)/4 = 3/4."),
  q("frac-03", [7, 8], "general", "mathematics", "math-fractions", "fraction-addition", 2, "What is 1/2 + 1/3?", "5/6", ["2/5", "5/6", "2/6", "1"], "Use sixths as a common denominator.", "1/2 = 3/6 and 1/3 = 2/6, so the sum is 5/6."),
  q("eq-01", [7, 8, 9], "general", "mathematics", "math-linear-equations", "one-step-equations", 1, "Solve: x + 6 = 14", "8", ["8", "20", "−8", "2"], "Undo the +6 by subtracting 6 from both sides.", "x = 14 − 6 = 8."),
  q("eq-02", [7, 8, 9], "general", "mathematics", "math-linear-equations", "two-step-equations", 2, "Solve: 3x − 4 = 11", "5", ["5", "7", "−5", "15"], "Add 4 to both sides, then divide by 3.", "3x = 15, so x = 5."),
  q("eq-03", [8, 9], "general", "mathematics", "math-linear-equations", "two-step-equations", 3, "Solve: 2(x + 3) = 18", "6", ["6", "12", "−6", "3"], "Divide both sides by 2 before subtracting 3.", "x + 3 = 9, hence x = 6."),
  q("ratio-01", [7, 8, 9], "general", "mathematics", "math-ratios", "ratios", 1, "A recipe uses 2 cups of oats for 3 batches. How many cups are needed for 6 batches?", "4", ["4", "6", "9", "12"], "Six batches is twice as many as three.", "Scale both parts by 2: 2 × 2 = 4 cups."),
  q("ratio-02", [7, 8, 9], "general", "mathematics", "math-ratios", "percentages", 2, "What is 20% of 45?", "9", ["9", "15", "20", "25"], "10% is one tenth; double that amount.", "10% of 45 is 4.5, so 20% is 9."),
  q("ratio-03", [8, 9], "general", "mathematics", "math-ratios", "percentages", 3, "A price of 80 is reduced by 15%. What is the new price?", "68", ["68", "65", "72", "75"], "Find 15% of 80, then subtract it from 80.", "15% of 80 is 12; 80 − 12 = 68."),
  q("motion-01", [9], "CBSE", "physics", "physics-motion", "speed", 1, "A cyclist travels 120 m in 20 s. What is the average speed?", "6 m/s", ["6 m/s", "140 m/s", "0.17 m/s", "2400 m/s"], "Average speed = distance ÷ time.", "120 ÷ 20 = 6 m/s."),
  q("motion-02", [9], "CBSE", "physics", "physics-motion", "distance-time", 2, "A runner moves at 4 m/s for 15 s. How far does the runner travel?", "60 m", ["60 m", "19 m", "3.75 m", "45 m"], "Distance = speed × time.", "4 × 15 = 60 m."),
  q("motion-03", [9], "CBSE", "physics", "physics-motion", "speed", 3, "A bus covers 90 km in 1.5 h. What is its average speed in km/h?", "60 km/h", ["60 km/h", "135 km/h", "45 km/h", "30 km/h"], "Divide the distance by 1.5 hours.", "90 ÷ 1.5 = 60 km/h."),
  q("force-01", [9], "CBSE", "physics", "physics-force", "force-mass-acceleration", 1, "What force accelerates a 2 kg object at 3 m/s²?", "6 N", ["6 N", "1.5 N", "5 N", "9 N"], "Use F = m × a.", "F = 2 × 3 = 6 N."),
  q("force-02", [9], "CBSE", "physics", "physics-force", "force-mass-acceleration", 2, "A 10 N force acts on a 2 kg cart. What is its acceleration?", "5 m/s²", ["5 m/s²", "20 m/s²", "8 m/s²", "0.2 m/s²"], "Rearrange F = m × a to a = F ÷ m.", "a = 10 ÷ 2 = 5 m/s²."),
  q("force-03", [9], "CBSE", "physics", "physics-force", "force-mass-acceleration", 3, "A net force of 12 N acts on a 3 kg object. Find its acceleration.", "4 m/s²", ["4 m/s²", "36 m/s²", "9 m/s²", "0.25 m/s²"], "Acceleration equals net force divided by mass.", "a = 12 ÷ 3 = 4 m/s²."),
  q("atom-01", [9], "CBSE", "chemistry", "chem-atoms", "chemical-formulae", 1, "Which formula represents one molecule of water?", "H2O", ["H2O", "HO2", "H2O2", "OH"], "A water molecule contains two hydrogen atoms and one oxygen atom.", "The formula H₂O records two H atoms and one O atom."),
  q("atom-02", [9], "CBSE", "chemistry", "chem-atoms", "chemical-formulae", 2, "What is the formula for magnesium chloride if Mg has valency 2 and Cl has valency 1?", "MgCl2", ["MgCl2", "Mg2Cl", "MgCl", "Mg2Cl2"], "Balance the total positive and negative valencies.", "One Mg²⁺ balances two Cl⁻ ions, giving MgCl₂."),
  q("atom-03", [9], "CBSE", "chemistry", "chem-atoms", "molecular-mass", 3, "Using H = 1 u and O = 16 u, what is the molecular mass of H₂O?", "18 u", ["18 u", "17 u", "16 u", "34 u"], "Add the mass of two hydrogen atoms and one oxygen atom.", "2 × 1 + 16 = 18 u."),
  q("cell-01", [9], "CBSE", "biology", "bio-cell", "cell-structures", 1, "Which cell structure contains most of a eukaryotic cell's genetic material?", "Nucleus", ["Nucleus", "Cell wall", "Vacuole", "Cytoplasm"], "It is often described as the cell's control centre.", "In eukaryotic cells, most genetic material is housed in the nucleus."),
  q("cell-02", [9], "CBSE", "biology", "bio-cell", "cell-structures", 2, "Which organelle is the main site of aerobic respiration in a typical eukaryotic cell?", "Mitochondrion", ["Mitochondrion", "Ribosome", "Vacuole", "Cell wall"], "It helps release usable energy from food molecules.", "Mitochondria are major sites of aerobic cellular respiration."),
  q("cell-03", [9], "CBSE", "biology", "bio-cell", "cell-structures", 3, "Which structure is present in plant cells and provides additional support outside the cell membrane?", "Cell wall", ["Cell wall", "Nucleus", "Mitochondrion", "Ribosome"], "It is a firm outer layer surrounding the plant cell membrane.", "The plant cell wall provides support outside the cell membrane."),
  q("eng-01", [6, 7, 8, 9, 10], "general", "english", "english-agreement", "verb-agreement", 1, "Choose the correct verb: “The list of topics ___ on the desk.”", "is", ["is", "are", "were", "be"], "The subject is “list,” which is singular.", "“List” is singular, so it takes “is.” The nearby plural noun “topics” does not change the subject."),
  q("eng-02", [6, 7, 8, 9, 10], "general", "english", "english-agreement", "verb-agreement", 2, "Choose the correct sentence.", "Each of the players has a notebook.", ["Each of the players has a notebook.", "Each of the players have a notebook.", "Each of the players are having a notebook.", "Each players has a notebook."], "The subject “each” is singular.", "“Each” takes a singular verb: “has.”"),
  q("eng-03", [7, 8, 9, 10], "general", "english", "english-agreement", "verb-agreement", 3, "Choose the correct verb: “Neither the coach nor the players ___ ready.”", "are", ["are", "is", "was", "be"], "With “neither…nor,” the verb agrees with the nearer subject.", "The nearer subject “players” is plural, so “are” is used."),
  q("part-01", [6, 7, 8, 9, 10], "general", "english", "english-parts", "parts-of-speech", 1, "In “The bright lantern glowed,” which word is the adjective?", "bright", ["bright", "lantern", "glowed", "the"], "Find the word describing the lantern.", "“Bright” describes the noun “lantern,” so it is an adjective."),
  q("part-02", [6, 7, 8, 9, 10], "general", "english", "english-parts", "parts-of-speech", 2, "In “Mira spoke softly,” which word is the adverb?", "softly", ["Mira", "spoke", "softly", "none"], "Find the word describing how Mira spoke.", "“Softly” modifies the verb “spoke,” so it is an adverb."),
  q("part-03", [7, 8, 9, 10], "general", "english", "english-parts", "parts-of-speech", 3, "In “The hikers crossed the narrow bridge,” what part of speech is “narrow”?", "adjective", ["adjective", "adverb", "verb", "pronoun"], "It describes the bridge.", "“Narrow” describes the noun “bridge,” so it is an adjective."),
];

export function questionsFor(topic: string, grade: number, board: string): ChallengeQuestion[] {
  return QUESTIONS.filter((item) => item.topic === topic && item.grades.includes(grade) && (item.board === "general" || item.board === board));
}
