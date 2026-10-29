import {
  api,
  state,
  view,
  escapeHtml as e,
  navigate,
  heading,
  errorMessage,
} from "./core.js";
import { explanationModal } from "./feedback-ui.js";

export const attemptKey = (quizId) => `hosh-attempt:${state.user.id}:${quizId}`;
export function artwork(slug) {
  const drawings = {
    basketball:
      '<circle cx="150" cy="89" r="59"/><path d="M91 89h118M150 30v118M112 44q72 45 0 90M188 44q-72 45 0 90"/>',
    football:
      '<circle cx="150" cy="89" r="59"/><path d="m150 62 25 18-10 29h-30l-10-29zM150 30v32M94 71l31 9M115 137l20-28M185 137l-20-28M206 71l-31 9M112 44l-18 27M188 44l18 27M209 98l-24 39M150 148l-35-11M91 98l24 39"/>',
    business:
      '<path d="M82 147V92h31v55m21 0V62h31v85m21 0V30h31v117M71 147h158M89 65l54-35 24 10 40-24"/><path d="m192 15 17-1-2 17"/>',
    sales:
      '<rect x="80" y="38" width="100" height="70" rx="16"/><path d="m102 108-2 19 27-19M180 67h26q14 0 14 14v50l-23-15h-45q-15 0-15-8M103 65h53M103 80h35"/>',
    networking:
      '<circle cx="150" cy="89" r="19"/><circle cx="91" cy="44" r="13"/><circle cx="210" cy="45" r="13"/><circle cx="84" cy="131" r="13"/><circle cx="215" cy="130" r="13"/><circle cx="150" cy="155" r="10"/><path d="m101 52 34 26m30 0 35-25m-66 46-39 24m71-23 38 23m-54-15v37"/>',
  };
  return `<svg viewBox="0 0 300 180" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M20 160h260M30 20h240" opacity=".12"/>${drawings[slug] || drawings.networking}<circle cx="247" cy="30" r="3" fill="currentColor" stroke="none"/></svg>`;
}
export async function startQuiz(quizId) {
  const result = await api(`/quizzes/${quizId}/start`, {
    method: "POST",
    body: {},
  });
  sessionStorage.setItem(attemptKey(quizId), result.attempt_token);
  if (location.hash === `#/quiz/${quizId}`)
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  else navigate(`#/quiz/${quizId}`);
}
export async function catalogView(parameter, isCurrent) {
  const quizzes = await api("/quizzes");
  if (!isCurrent()) return;
  view.innerHTML = `<section class="catalog-hero"><div><p class="eyebrow">A LITTLE WISER, EVERY DAY</p><h1>Feed your <em>curiosity.</em></h1><p class="lede">Big ideas start with small questions. Pick something you love,<br class="desktop-break"> discover something you don’t know yet.</p></div><div class="hero-aside"><span class="line-star" aria-hidden="true"><span class="star-shape"></span></span><p>YOUR NEXT DISCOVERY<br>IS ONE QUESTION AWAY.</p></div></section><div class="section-heading"><div><span class="section-index">01 /</span><h2>The collections</h2></div><span class="collection-count">${quizzes.length.toString().padStart(2, "0")} topics to explore</span></div><section class="quiz-grid" aria-label="Quiz collections">${quizzes.map((q, i) => `<article class="quiz-card"><div class="card-art art-${e(q.slug)}"><span class="card-number">${String(i + 1).padStart(2, "0")}</span>${artwork(q.slug)}<span class="card-category">${e(q.category)}</span></div><div class="card-content"><div class="card-title"><h3>${e(q.title)}</h3><span class="card-arrow" aria-hidden="true">→</span></div><p>${e(q.description)}</p><div class="card-meta"><span>10 questions</span><span>At your pace</span></div><button class="button card-start" data-start="${q.id}" ${q.question_count < 10 ? "disabled" : ""}>${q.question_count < 10 ? "Coming soon" : "Take the quiz"} <span aria-hidden="true">→</span></button></div></article>`).join("")}<aside class="collection-note"><span class="note-mark">“</span><h3>The more you know,<br>the more you grow.</h3><p>No timer. No pressure.<br>Just you, a few good questions,<br>and a fresh perspective.</p><span class="eyebrow">MAKE ROOM FOR CURIOSITY</span></aside></section>`;
  view.querySelectorAll("[data-start]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await startQuiz(button.dataset.start);
      } catch (error) {
        button
          .closest(".card-content")
          .insertAdjacentHTML("beforeend", errorMessage(error));
        button.disabled = false;
      }
    };
  });
  view
    .querySelectorAll(".quiz-card")
    .forEach((card, index) =>
      card
        .querySelector(".card-content")
        .insertAdjacentHTML(
          "beforeend",
          `<a class="flashcard-link" href="#/flashcards/${quizzes[index].id}">Or, warm up with flashcards →</a>`,
        ),
    );
}

export async function quizView(quizId, isCurrent) {
  if (!/^[1-9]\d*$/.test(quizId)) throw new Error("Quiz not found.");
  let token = sessionStorage.getItem(attemptKey(quizId));
  if (!token) {
    const started = await api(`/quizzes/${quizId}/start`, {
      method: "POST",
      body: {},
    });
    token = started.attempt_token;
    sessionStorage.setItem(attemptKey(quizId), token);
  }
  const [questions, quizzes] = await Promise.all([
    api(`/quizzes/${quizId}/questions?token=${encodeURIComponent(token)}`),
    api("/quizzes"),
  ]);
  if (!isCurrent()) return;
  const quiz = quizzes.find((q) => q.id === Number(quizId));
  let index = questions.filter((q) => q.selected_choice_id !== null).length;
  async function finish() {
    if (!isCurrent()) return;
    view.innerHTML = '<p class="loading">Putting your results together…</p>';
    try {
      const result = await api("/attempts/complete", {
        method: "POST",
        body: { attempt_token: token },
      });
      if (isCurrent()) showResults(quiz, result);
    } catch (error) {
      if (!isCurrent()) return;
      view.innerHTML = `${errorMessage(error)}<button class="button primary" id="finish-retry">Try finishing again</button>`;
      document.querySelector("#finish-retry").onclick = finish;
    }
  }
  function questionView() {
    if (!isCurrent()) return;
    if (index === questions.length) {
      finish();
      return;
    }
    const question = questions[index];
    view.innerHTML = `<div class="quiz-topline"><a class="back-link" href="#/catalog">← Back to collections</a><span>${e(quiz.title)} <span class="muted">/ THE QUIZ</span></span></div><section class="quiz-player"><div class="question-progress"><span class="eyebrow">QUESTION ${String(index + 1).padStart(2, "0")} <span class="muted">OF ${questions.length}</span></span><span class="progress-percent">${Math.round((index / questions.length) * 100)}% complete</span></div><progress max="${questions.length}" value="${index}" aria-label="Quiz progress"></progress><h1 class="question-title">${e(question.question_text)}</h1><p class="question-instruction">One question. Four possibilities. What do you think?</p><form id="quiz-form"><fieldset class="answer-choices"><legend class="sr-only">Choose one answer</legend>${question.choices.map((c) => `<label class="answer-option"><input type="radio" name="choice" value="${c.id}" required><span class="choice-letter">${e(c.choice_label)}</span><span class="choice-text">${e(c.choice_text)}</span><span class="choice-check" aria-hidden="true"></span></label>`).join("")}</fieldset><div id="quiz-error" role="alert"></div><div class="quiz-bottom"><span>Trust your curiosity.</span><button class="button primary" type="submit">Submit answer <span aria-hidden="true">→</span></button></div></form></section>`;
    document.querySelector("#quiz-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const chosen = Number(new FormData(form).get("choice"));
      const button = form.querySelector("button");
      button.disabled = true;
      form.querySelector("fieldset").disabled = true;
      try {
        const feedback = await api("/attempts/validate", {
          method: "POST",
          body: {
            attempt_token: token,
            question_id: question.id,
            chosen_choice_id: chosen,
          },
        });
        if (!isCurrent()) return;
        await explanationModal(feedback, index === questions.length - 1);
        index++;
        questionView();
      } catch (error) {
        if (!form.isConnected) return;
        document.querySelector("#quiz-error").innerHTML = errorMessage(error);
        button.disabled = false;
        form.querySelector("fieldset").disabled = false;
      }
    };
  }
  questionView();
}
function showResults(quiz, result) {
  const tier =
    result.percentage >= 90
      ? "Mastery Achieved"
      : result.percentage >= 70
        ? "Proficient"
        : "Needs Practice";
  view.innerHTML = `<section class="results"><p class="eyebrow">${e(quiz.title)} / YOUR RESULTS</p><h1>A little wiser<br>than <em>before.</em></h1><p class="lede">Every question is a chance to learn. Here’s how you did.</p><div class="score-circle"><strong>${result.percentage}<small>%</small></strong><span>${result.score} of ${result.total} correct</span></div><span class="result-badge">${tier}</span><div class="result-actions"><button class="button primary" id="retry-quiz">Retry quiz <span aria-hidden="true">→</span></button><a class="button" href="#/catalog">Return to collections</a></div></section>`;
  document
    .querySelector(".result-actions")
    .insertAdjacentHTML(
      "beforeend",
      `<a class="button" href="#/leaderboard/${quiz.id}">View topic leaderboard</a>`,
    );
  document.querySelector("#retry-quiz").onclick = async (event) => {
    event.currentTarget.disabled = true;
    try {
      await startQuiz(quiz.id);
    } catch (error) {
      view.insertAdjacentHTML("beforeend", errorMessage(error));
    }
  };
}
export function registerQuizRoutes(routes) {
  routes.set("catalog", catalogView);
  routes.set("quiz", quizView);
}
