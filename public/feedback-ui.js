import { view, escapeHtml as e } from "./core.js";

export function explanationModal(result, lastQuestion) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = `explanation-dialog ${result.is_correct ? "correct" : "incorrect"}`;
    dialog.setAttribute("aria-labelledby", "feedback-title");
    dialog.setAttribute("aria-describedby", "feedback-explanation");
    dialog.innerHTML = `<p class="eyebrow">A MOMENT OF DISCOVERY</p><div class="feedback-symbol" aria-hidden="true">${result.is_correct ? "✓" : "i"}</div><h2 id="feedback-title">${result.is_correct ? "That’s right." : "Something new to know."}</h2><p class="feedback-status">${result.is_correct ? "Correct!" : "Not quite. Here’s the answer."}</p><div class="correct-answer"><span>${e(result.choice_label)}</span><strong>${e(result.correct_choice_text)}</strong></div><p id="feedback-explanation">${e(result.explanation)}</p><button class="button primary full" id="feedback-next">${lastQuestion ? "See my results" : "Next question"} <span aria-hidden="true">→</span></button>`;
    view.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve();
      },
      { once: true },
    );
    dialog.querySelector("button").onclick = () => dialog.close();
    dialog.showModal();
  });
}
