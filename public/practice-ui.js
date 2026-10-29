import { api, view, escapeHtml as e, heading, errorMessage } from "./core.js";
import { startQuiz } from "./quiz-ui.js";

export async function flashcardView(quizId, isCurrent) {
  const [questions, quizzes] = await Promise.all([
    api(`/flashcards/${quizId}/questions`),
    api("/quizzes"),
  ]);
  if (!isCurrent()) return;
  const quiz = quizzes.find((q) => q.id === Number(quizId));
  let index = 0;
  let flipped = false;
  function renderCard() {
    if (!isCurrent()) return;
    if (!questions.length) {
      view.innerHTML = `${heading("PRACTICE MODE", "No cards just yet.")}<a class="button" href="#/catalog">Back to collections</a>`;
      return;
    }
    if (index === questions.length) {
      view.innerHTML = `<section class="results">${heading("PRACTICE MAKES POSSIBILITIES", "A little more in your corner.", `You explored all ${questions.length} cards in ${quiz.title}. This was practice—no scores, no attempts, just learning.`)}<div class="result-actions"><button class="button" id="restart-cards">Practice again</button><button class="button primary" id="practice-quiz">Ready for the quiz? →</button><a class="button" href="#/catalog">Back to collections</a></div></section>`;
      document.querySelector("#restart-cards").onclick = () => {
        index = 0;
        flipped = false;
        renderCard();
      };
      document.querySelector("#practice-quiz").onclick = async (event) => {
        event.currentTarget.disabled = true;
        try {
          await startQuiz(quizId);
        } catch (error) {
          view.insertAdjacentHTML("beforeend", errorMessage(error));
        }
      };
      return;
    }
    const question = questions[index];
    const correct = question.choices.find((c) => c.is_correct);
    view.innerHTML = `<div class="quiz-topline"><a class="back-link" href="#/catalog">← Back to collections</a><span>${e(quiz.title)} <span class="muted">/ FLASHCARDS</span></span></div><section class="practice"><p class="eyebrow">NO SCORE. NO PRESSURE. JUST POSSIBILITY.</p><h1>Give your curiosity<br>some <em>room.</em></h1><div class="flashcard ${flipped ? "flipped" : ""}" aria-live="polite"><div class="flashcard-top"><span>${flipped ? "THE OTHER SIDE" : "A LITTLE FOOD FOR THOUGHT"}</span><span>${String(index + 1).padStart(2, "0")} / ${questions.length}</span></div>${flipped ? `<p class="eyebrow">THE ANSWER · ${e(correct.choice_label)}</p><h2>${e(correct.choice_text)}</h2><p class="flashcard-explanation">${e(question.explanation)}</p>` : `<h2>${e(question.question_text)}</h2><p class="flashcard-hint">Take a moment. What comes to mind?</p>`}<button class="button flip-button" id="flip-card">${flipped ? "Back to question" : "Flip card"} <span aria-hidden="true">↻</span></button></div><div class="flashcard-controls"><span>Ungraded practice · your progress stays yours</span><button class="button" id="next-card">${index === questions.length - 1 ? "Finish practice" : "Next card"} →</button></div></section>`;
    document.querySelector("#flip-card").onclick = () => {
      flipped = !flipped;
      renderCard();
      document.querySelector("#flip-card").focus();
    };
    document.querySelector("#next-card").onclick = () => {
      index++;
      flipped = false;
      renderCard();
    };
  }
  renderCard();
}
