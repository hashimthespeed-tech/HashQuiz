import { pathToFileURL } from "node:url";
import { quizzes } from "../data/quizzes.js";
import { createPool, transaction } from "../src/db.js";

export async function seed(pool) {
  await transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(6843202)");
    for (const quiz of quizzes) {
      const {
        rows: [created],
      } = await client.query(
        "INSERT INTO quizzes(slug,title,description,category) VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO NOTHING RETURNING id",
        [quiz.slug, quiz.title, quiz.description, quiz.category],
      );
      if (!created) continue;
      for (const [question, choices, correct, explanation] of quiz.questions) {
        const {
          rows: [row],
        } = await client.query(
          "INSERT INTO questions(quiz_id,question_text,explanation) VALUES($1,$2,$3) RETURNING id",
          [created.id, question, explanation],
        );
        for (let index = 0; index < 4; index++)
          await client.query(
            "INSERT INTO choices(question_id,choice_label,choice_order,choice_text,is_correct) VALUES($1,$2,$3,$4,$5)",
            [
              row.id,
              "ABCD"[index],
              index + 1,
              choices[index],
              index === correct,
            ],
          );
      }
    }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try {
    await seed(pool);
    console.log("Quiz seed complete; existing quizzes and edits preserved.");
  } finally {
    await pool.end();
  }
}
