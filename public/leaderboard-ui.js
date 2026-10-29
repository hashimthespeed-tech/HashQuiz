import {
  api,
  state,
  view,
  escapeHtml as e,
  heading,
  navigate,
} from "./core.js";

export async function leaderboardView(quizId, isCurrent) {
  const overall = !quizId || quizId === "overall";
  const [quizzes, leaders] = await Promise.all([
    api("/quizzes"),
    api(overall ? "/leaderboard/overall" : `/leaderboard/quiz/${quizId}`),
  ]);
  if (!isCurrent()) return;
  const selected = quizzes.find((q) => q.id === Number(quizId));
  view.innerHTML = `${heading("A LITTLE FRIENDLY COMPETITION", "Curiosity looks good on you.", "Celebrate the people who keep showing up, asking questions, and growing.")}<div class="leaderboard-controls"><div><h2>${overall ? "The big picture" : e(selected?.title)}</h2><p>${overall ? "Ranked by total completed quizzes. Every finished retry counts." : "Your best score takes the spotlight. Every completed attempt is counted."}</p></div><label>View leaderboard<select id="leaderboard-filter"><option value="overall">Overall · most completed</option>${quizzes.map((q) => `<option value="${q.id}" ${q.id === Number(quizId) ? "selected" : ""}>${e(q.title)} · highest score</option>`).join("")}</select></label></div>${leaders.length ? `<div class="table-wrap"><table class="leaderboard-table"><caption class="sr-only">${overall ? "Overall" : e(selected?.title)} leaderboard</caption><thead><tr><th>Rank</th><th>Player</th>${overall ? "" : "<th>Best score</th>"}<th>Completed attempts</th></tr></thead><tbody>${leaders.map((leader, index) => `<tr class="${leader.user_id === state.user.id ? "your-ranking" : ""}"><td><span class="rank ${index === 0 ? "top-rank" : ""}">${String(index + 1).padStart(2, "0")}</span></td><td><strong>${e(leader.username)}</strong>${leader.user_id === state.user.id ? '<span class="you-label">YOU</span>' : ""}</td>${overall ? "" : `<td><span class="table-badge">${leader.highest_score} / 10</span></td>`}<td>${leader.total_completed_attempts}</td></tr>`).join("")}</tbody></table></div><p class="table-note">${overall ? "Ties go to the player whose latest completed attempt was earlier." : "Ties go to the player with the earlier first completed attempt in this topic."} Unfinished quizzes do not count.</p>` : '<div class="empty-state"><h2>A new chapter awaits.</h2><p>Complete a quiz to get the conversation started.</p><a class="button primary" href="#/catalog">Explore the collections →</a></div>'}`;
  document.querySelector("#leaderboard-filter").onchange = (event) =>
    navigate(`#/leaderboard/${event.target.value}`);
}
